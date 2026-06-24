import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { extractTextFromImage } from './ocr.ts';
import { parseReceiptText } from './parser.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('1. Request body:', JSON.stringify(body));
    const { imagePath, userId } = body;

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
    console.log('7. OCR text length:', rawText.length, '| Full text:', rawText);

    // 4. Parse
    const parsed = parseReceiptText(rawText);
    console.log('8. Parsed — warehouse:', parsed.warehouseCode, '| date:', parsed.transactionDate, '| tc#:', parsed.transactionNumber ?? 'n/a', '| items:', parsed.items.length, '| expected:', parsed.expectedItemCount ?? 'unknown', '| subtotal:', parsed.subtotal ?? 'not found', '| tax:', parsed.tax ?? 'not found', '| total:', parsed.grandTotal ?? 'not found');
    console.log('8b. Items detail:', JSON.stringify(parsed.items));
    if (parsed.itemCountMismatch) {
      console.warn(`ITEM COUNT MISMATCH: parsed ${parsed.items.length} but receipt says ${parsed.expectedItemCount}. OCR text may need parser update.`);
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
        .single();
      warehouseId = warehouse?.id ?? null;
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
      console.log('9. Duplicate detected — existing receipt:', duplicateReceiptId, '— removing orphan image');
      await supabase.storage.from('receipts').remove([imagePath]);
      return new Response(
        JSON.stringify({ receiptId: duplicateReceiptId, itemCount: 0, duplicate: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // 6. Insert receipt
    console.log('9. Inserting receipt for user:', userId);
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
        quantity: 1,
      });

      if (itemError) console.error('Receipt item insert error:', itemError.message);
    }

    console.log('11. Done — inserted', parsed.items.length, 'items');
    const computedTotal = parsed.items.reduce((sum, i) => sum + i.unitPrice - i.discountAmount, 0);
    if (parsed.subtotal !== null && Math.abs(computedTotal - parsed.subtotal) > 0.02) {
      console.warn(`PRICE SUM MISMATCH: computed ${computedTotal.toFixed(2)} vs receipt subtotal ${parsed.subtotal}. Likely OCR digit drop — stored subtotal from receipt.`);
    }

    return new Response(
      JSON.stringify({
        receiptId: receipt.id,
        itemCount: parsed.items.length,
        expectedItemCount: parsed.expectedItemCount,
        itemCountMismatch: parsed.itemCountMismatch,
        subtotal: parsed.subtotal,
        subtotalSource: parsed.subtotal !== null ? 'receipt' : 'computed',
        duplicate: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('Unhandled exception:', message, err instanceof Error ? err.stack : '');
    return errorResponse(message, 500);
  }
});

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status },
  );
}
