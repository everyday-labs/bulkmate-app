import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { awardCheckIn } from '../_shared/checkInRewards.ts';
import { extractTextFromImage } from '../_shared/googleVision.ts';
import { capturePostHogException } from '../_shared/posthog.ts';
import { parseReceiptText } from './parser.ts';

// Warehouses seeded from Google Places (scripts/seed-warehouses-from-google-places.mjs)
// get a synthetic `GP-######` code — Places has no concept of Costco's real
// internal store number, so an exact warehouse_code lookup will always miss
// for them. Fallback: check whether the receipt's OCR text contains that
// warehouse's postal code or city name. On a match, link the receipt and —
// since the receipt's real code (parsed.warehouseCode) is already known —
// overwrite that warehouse's placeholder code with the real one. The first
// receipt scanned at any given warehouse "teaches" the DB its true code;
// every later scan there hits the fast exact-match path above with no
// fallback needed.
//
// Matching is CITY-FIRST, with postal code only used to disambiguate between
// same-city candidates. An earlier version had this backwards (postal code
// first, city as fallback) and produced a real production failure: a Santa
// Clara, CA receipt contains the phone number "(408) 567-9000", and Taichung
// City, Taiwan has postal code "408" — so `\b408\b` matched, the receipt was
// linked to a warehouse in Taiwan, and the self-heal then overwrote that
// warehouse's code with the US store number. 10 seeded warehouses have
// postal codes of 3 characters or fewer, so this was systemic, not a
// one-off.
//
// A city name is a much stronger signal: it's printed in the receipt header
// as a word, and it can't collide with an area code or street number the way
// a bare 3-digit string can. Postal codes are still useful, but only to pick
// between warehouses that already agree on the city.
//
// The search is restricted to the receipt's header region (first ~12
// non-blank OCR lines) — scanning the whole receipt risks false hits inside
// long barcode/transaction-number digit runs lower down.
async function matchWarehouseByReceiptHeader(
  supabase: ReturnType<typeof createClient>,
  rawText: string,
): Promise<{ id: string; warehouse_code: string } | null> {
  // Joined with spaces, not newlines — OCR sometimes splits a multi-token
  // postal code (e.g. Canada's "K2G 5W5") across two lines, and a space-
  // joined string lets the \s* below still match across that split.
  // Trim + drop blank lines first, like parser.ts's `lines` does — Vision
  // OCR commonly emits blank/whitespace-only lines near the top of a
  // receipt, which would otherwise shrink the effective header window
  // below the intended 12 real lines and could push the postal code/city
  // just outside it.
  const headerText = rawText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12).join(' ').toUpperCase();

  const { data: candidates } = await supabase
    .from('warehouses')
    .select('id, warehouse_code, city, postal_code')
    .like('warehouse_code', 'GP-%');

  if (!candidates?.length) return null;
  const rows = candidates as { id: string; warehouse_code: string; city: string | null; postal_code: string | null }[];

  // Step 1 — city must appear in the header. This is the required signal.
  const byCity = rows.filter((w) => w.city && headerText.includes(w.city.toUpperCase()));
  if (byCity.length === 0) return null;
  if (byCity.length === 1) return byCity[0];

  // Step 2 — several warehouses share this city, so use the postal code to
  // pick one. \b anchors stop a code matching inside a longer digit run
  // (e.g. "95110" inside "295110123"); internal whitespace becomes \s* so
  // Canada's "K2G 5W5" still matches "K2G5W5". Codes shorter than 4 chars
  // are skipped entirely — they're too collision-prone to trust even here.
  const byPostalCode = byCity.filter((w) => {
    if (!w.postal_code || w.postal_code.replace(/\s/g, '').length < 4) return false;
    const escaped = w.postal_code.toUpperCase()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s*');
    return new RegExp(`\\b${escaped}\\b`).test(headerText);
  });
  if (byPostalCode.length === 1) return byPostalCode[0];

  return null; // still ambiguous — don't guess
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string | undefined;
  try {
    const body = await req.json();
    console.log('1. Request body:', JSON.stringify(body));
    const { imagePath } = body;
    userId = body.userId;

    if (!imagePath || !userId) {
      return errorResponse('imagePath and userId are required', 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const visionKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    console.log('2. Env check — SUPABASE_URL:', !!supabaseUrl, '| SERVICE_KEY:', !!serviceKey, '| VISION_KEY:', !!visionKey);

    const supabase = createClient(supabaseUrl!, serviceKey!);

    // 1. Download image from Storage
    console.log('3. Downloading image:', imagePath);
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('receipts')
      .download(imagePath);

    if (downloadError || !imageData) {
      console.error('Download error:', downloadError?.message);
      return errorResponse(`Failed to download image: ${downloadError?.message}`, 400);
    }
    console.log('4. Image downloaded, size:', imageData.size);

    // 2. Convert to base64 in chunks to avoid call stack overflow on large images
    const arrayBuffer = await imageData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    console.log('5. Base64 length:', base64.length);

    // 3. OCR
    console.log('6. Calling Vision API...');
    const rawText = await extractTextFromImage(base64);
    // Deliberately not logging rawText itself — it's the full receipt OCR
    // output (member number, every item, prices), and Supabase function
    // logs aren't a place for that in plaintext. parsed.* below already
    // gives enough signal to debug most OCR issues; use ocr_raw on the
    // stored receipt row (RLS-scoped to the owning user) if you need the
    // actual text for a specific failure.
    console.log('7. OCR text length:', rawText.length);

    // 4. Parse
    const parsed = parseReceiptText(rawText);
    console.log('8. Parsed — warehouse:', parsed.warehouseCode, '| date:', parsed.transactionDate, '| tc#:', parsed.transactionNumber ?? 'n/a', '| items:', parsed.items.length, '| expected:', parsed.expectedItemCount ?? 'unknown', '| subtotal:', parsed.subtotal ?? 'not found', '| tax:', parsed.tax ?? 'not found', '| total:', parsed.grandTotal ?? 'not found');
    console.log('8b. Items detail:', JSON.stringify(parsed.items));
    if (parsed.itemCountMismatch) {
      const parsedUnits = parsed.items.reduce((n, i) => n + i.quantity, 0);
      console.warn(`ITEM COUNT MISMATCH: parsed ${parsedUnits} units across ${parsed.items.length} rows, but receipt says ${parsed.expectedItemCount}. OCR text may need parser update.`);
    }

    if (!parsed.transactionDate) {
      return errorResponse('Could not extract transaction date from receipt', 422);
    }
    if (parsed.items.length === 0) {
      return errorResponse('No line items found on receipt', 422);
    }

    // 5. Resolve warehouse
    let warehouseId: string | null = null;
    if (parsed.warehouseCode) {
      const { data: warehouse } = await supabase
        .from('warehouses')
        .select('id')
        .eq('warehouse_code', parsed.warehouseCode)
        .maybeSingle();
      warehouseId = warehouse?.id ?? null;

      // Exact code miss — try the postal-code/city fallback against
      // Google-Places-seeded warehouses (synthetic GP-###### codes). See
      // matchWarehouseByReceiptHeader's comment above for why.
      if (!warehouseId) {
        const headerMatch = await matchWarehouseByReceiptHeader(supabase, rawText);
        if (headerMatch) {
          warehouseId = headerMatch.id;
          console.log(`10. Header fallback match: warehouse ${headerMatch.id} (was ${headerMatch.warehouse_code}) — backfilling real code ${parsed.warehouseCode}`);

          const { error: codeUpdateError } = await supabase
            .from('warehouses')
            .update({ warehouse_code: parsed.warehouseCode })
            .eq('id', headerMatch.id);
          if (codeUpdateError) {
            // Most likely cause: parsed.warehouseCode already belongs to
            // another row (a bad OCR read, or a genuine duplicate-code edge
            // case). Never fail the receipt over this — the warehouse link
            // itself (warehouseId) is still valid either way.
            console.warn('Could not backfill warehouse_code:', codeUpdateError.message);
          }
        }
      }
    }

    // 5b. Duplicate detection — check before inserting
    // Priority 1: match on TC# (most reliable — unique per Costco transaction)
    // Priority 2: match on user + date + total within ±$0.10 (handles missing TC#)
    let duplicateReceiptId: string | null = null;

    if (parsed.transactionNumber) {
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_number', parsed.transactionNumber)
        .maybeSingle();
      duplicateReceiptId = existing?.id ?? null;
    }

    if (!duplicateReceiptId && parsed.transactionDate && parsed.subtotal != null) {
      const tolerance = 0.10;
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('user_id', userId)
        .eq('transaction_date', parsed.transactionDate)
        .gte('total_amount', parsed.subtotal - tolerance)
        .lte('total_amount', parsed.subtotal + tolerance)
        .maybeSingle();
      duplicateReceiptId = existing?.id ?? null;
    }

    if (duplicateReceiptId) {
      console.log('9a. Duplicate detected — existing receipt:', duplicateReceiptId, '— removing orphan image');
      await supabase.storage.from('receipts').remove([imagePath]);
      return new Response(
        JSON.stringify({ receiptId: duplicateReceiptId, itemCount: 0, duplicate: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // 6. Insert receipt
    console.log('9b. Inserting receipt for user:', userId);
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        warehouse_id: warehouseId,
        transaction_date: parsed.transactionDate,
        total_amount: parsed.subtotal
          ?? parsed.items.reduce((sum, i) => sum + i.unitPrice - i.discountAmount, 0),
        tax_amount: parsed.tax,
        transaction_number: parsed.transactionNumber,
        image_path: imagePath,
        ocr_raw: rawText,
      })
      .select('id')
      .single();

    if (receiptError) {
      console.error('Receipt insert error:', receiptError.message, receiptError.details, receiptError.hint);
      return errorResponse(receiptError.message, 500);
    }
    console.log('10. Receipt inserted:', receipt.id);

    // 7. Upsert products and insert receipt items
    for (const item of parsed.items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .upsert({ sku: item.sku, name: item.description }, { onConflict: 'sku', ignoreDuplicates: false })
        .select('id')
        .single();

      if (productError) console.error('Product upsert error:', productError.message);

      const { error: itemError } = await supabase.from('receipt_items').insert({
        receipt_id: receipt.id,
        product_id: product?.id ?? null,
        sku: item.sku,
        description: item.description,
        unit_price: item.unitPrice,
        discount_amount: item.discountAmount,
        quantity: item.quantity,
      });

      if (itemError) console.error('Receipt item insert error:', itemError.message);
    }

    console.log('11. Done — inserted', parsed.items.length, 'items');
    const computedTotal = parsed.items.reduce((sum, i) => sum + i.unitPrice - i.discountAmount, 0);
    if (parsed.subtotal !== null && Math.abs(computedTotal - parsed.subtotal) > 0.02) {
      console.warn(`PRICE SUM MISMATCH: computed ${computedTotal.toFixed(2)} vs receipt subtotal ${parsed.subtotal}. Likely OCR digit drop — stored subtotal from receipt.`);
    }

    // 8. Trigger price match check in the background — fire-and-forget so it
    //    doesn't block the response. Errors are logged but not surfaced to client.
    // Scanning a receipt is proof the user was physically at the warehouse, so
    // it earns the same check-in reward as a GPS check-in — dated to the
    // receipt's transaction date, not today, since receipts are often uploaded
    // days later. The one-per-warehouse-per-day unique index makes a repeat
    // (second receipt from the same trip, or a GPS check-in already logged
    // that day) a silent no-op rather than a double award.
    let checkIn: { warehouseName: string; totalStars: number; fanTier: string; tierUpgraded: boolean; newBadges: unknown[] } | null = null;
    if (warehouseId) {
      try {
        const { data: wh } = await supabase
          .from('warehouses')
          .select('name, tier')
          .eq('id', warehouseId)
          .maybeSingle();

        const award = await awardCheckIn(
          supabase,
          {
            user_id: userId,
            warehouse_id: warehouseId,
            checked_in_at: `${parsed.transactionDate}T12:00:00Z`,
          },
          (wh?.tier as string) ?? 'Common',
        );

        if (!award.already_checked_in) {
          checkIn = {
            warehouseName: (wh?.name as string) ?? 'Costco',
            totalStars: award.total_stars,
            fanTier: award.fan_tier,
            tierUpgraded: award.tier_upgraded,
            newBadges: award.new_badges,
          };
        }
      } catch (err) {
        // A failed check-in must never cost the user their receipt.
        console.warn('12. check-in award failed (non-blocking):', err instanceof Error ? err.message : String(err));
      }
    }

    const priceMatchUrl = `${supabaseUrl}/functions/v1/price-match-check`;
    fetch(priceMatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ receipt_id: receipt.id, user_id: userId }),
    }).then(async (res) => {
      const text = await res.text();
      console.log('12. price-match-check result:', text);
    }).catch((err) => {
      console.warn('12. price-match-check fire failed (non-blocking):', err?.message);
    });

    return new Response(
      JSON.stringify({
        receiptId: receipt.id,
        // Total units, so this is directly comparable to expectedItemCount
        // (the receipt's "TOTAL NUMBER OF ITEMS SOLD") — repeat SKUs are one
        // row with quantity > 1, so row count would under-report.
        itemCount: parsed.items.reduce((n, i) => n + i.quantity, 0),
        expectedItemCount: parsed.expectedItemCount,
        itemCountMismatch: parsed.itemCountMismatch,
        subtotal: parsed.subtotal,
        subtotalSource: parsed.subtotal !== null ? 'receipt' : 'computed',
        duplicate: false,
        checkIn,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('Unhandled exception:', message, err instanceof Error ? err.stack : '');
    await capturePostHogException(err, { functionName: 'ingest-receipt' }, userId);
    return errorResponse(message, 500);
  }
});

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}
