import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { fetchFromRapidApi } from '../_shared/rapidApi.ts';
import { sendExpoPushNotifications, type ExpoPushMessage } from '../_shared/expoPush.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { buildPriceDropEmail } from '../_shared/alertMessages.ts';
import { unsubscribeUrl } from '../_shared/notifyLinks.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemToCheck = {
  receipt_item_id: string;
  receipt_id: string;
  user_id: string;
  sku: string;
  description: string;
  net_paid: number; // unit_price - discount_amount
};

// A receipt_items row as selected below. In sweep mode `receipts` is a
// many-to-one join — an object at runtime, though the untyped client infers
// an array from the select string.
type ReceiptItemRow = {
  id: string;
  sku: string;
  description: string | null;
  unit_price: number;
  discount_amount: number | null;
};
type SweepItemRow = ReceiptItemRow & { receipt_id: string; receipts: unknown };

type PriceResult = {
  current_price: number;   // best price to compare against (lowest of API + ledger)
  api_sale_price: number | null;
  api_list_price: number | null;
  api_online_price: number | null;
  lowest_receipt_price: number | null;
  source: 'cache' | 'rapidapi' | 'ocr_ledger';
  // API product metadata (null on cache/ledger hits)
  brand?: string | null;
  image_url?: string | null;
  pdp_url?: string | null;
  rating?: number | null;
};

// ---------------------------------------------------------------------------
// Costco Live Data API (RapidAPI) — client lives in ../_shared/rapidApi.ts,
// shared with barcode-lookup. See ../../../EXTERNAL_APIS.md for details.
// ---------------------------------------------------------------------------

const PRICE_CACHE_TTL_HOURS = 72;

// ---------------------------------------------------------------------------
// OCR ledger: median net-paid price from other users' recent receipts.
// In-store only — no API call. Grows more reliable as user base grows.
// ---------------------------------------------------------------------------

async function fetchFromOCRLedger(
  supabase: SupabaseClient,
  sku: string,
): Promise<number | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from('receipt_items')
    .select('unit_price, discount_amount')
    .eq('sku', sku)
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(100);

  if (!data || data.length < 3) return null; // need at least 3 data points to be meaningful

  const netPrices = data
    .map((r: { unit_price: number; discount_amount: number | null }) =>
      Number(r.unit_price) - Number(r.discount_amount ?? 0)
    )
    .sort((a: number, b: number) => a - b);

  const mid = Math.floor(netPrices.length / 2);
  return netPrices.length % 2 === 0
    ? (netPrices[mid - 1] + netPrices[mid]) / 2
    : netPrices[mid];
}

// ---------------------------------------------------------------------------
// Resolve current price with dual tracking
//
// Order:
//   1. 24h cache hit on products.api_sale_price  → skip API call
//   2. OCR ledger (free, in-store)
//   3. RapidAPI (paid, warehouse + online)
//
// On any external hit, updates products with both price tracks and metadata.
// current_price is always set to the lowest of what we know (api vs ledger).
// ---------------------------------------------------------------------------

async function resolvePrice(
  supabase: SupabaseClient,
  sku: string,
  apiKey: string,
): Promise<PriceResult | null> {
  // 1. Load existing product row
  const { data: product } = await supabase
    .from('products')
    .select(
      'current_price, price_updated_at, api_sale_price, api_price_updated_at, lowest_api_price, lowest_receipt_price',
    )
    .eq('sku', sku)
    .maybeSingle();

  // 2. Check cache — if API price is fresh, skip the API call
  let apiResult: Awaited<ReturnType<typeof fetchFromRapidApi>> = null;
  let apiSource: 'cache' | 'rapidapi' = 'cache';

  if (product?.api_price_updated_at) {
    const ageHours =
      (Date.now() - new Date(product.api_price_updated_at).getTime()) / (1000 * 60 * 60);
    if (ageHours < PRICE_CACHE_TTL_HOURS && product.api_sale_price != null) {
      // Cache hit — reconstruct a minimal result from stored values. Only
      // sale_price is meaningful here; the rest are unused by this function
      // but required to satisfy the shared RapidApiProduct shape.
      apiResult = {
        sku,
        name: '',
        sale_price: Number(product.api_sale_price),
        list_price: null,
        online_price: null,
        brand: null,
        image_url: null,
        pdp_url: null,
        rating: null,
        total_reviews: null,
        in_warehouse: true,
      };
      apiSource = 'cache';
    }
  }

  // 3. OCR ledger check
  const ledgerPrice = await fetchFromOCRLedger(supabase, sku);

  // 4. API call if cache missed
  if (!apiResult && apiKey) {
    apiResult = await fetchFromRapidApi(sku, apiKey);
    apiSource = 'rapidapi';
  }

  // Nothing at all — can't price-match this SKU yet
  if (!apiResult && ledgerPrice == null) return null;

  const apiSalePrice = apiResult?.sale_price ?? null;

  // Best current price = lowest of (API warehouse price, OCR ledger median)
  const candidates = [apiSalePrice, ledgerPrice].filter((v): v is number => v != null);
  const bestPrice = Math.min(...candidates);

  // 5. Persist updated price data
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    current_price: bestPrice,
    price_updated_at: now,
  };

  if (apiResult && apiSource === 'rapidapi') {
    updatePayload.api_sale_price = apiSalePrice;
    updatePayload.api_list_price = apiResult.list_price;
    updatePayload.api_online_price = apiResult.online_price;
    updatePayload.api_price_updated_at = now;

    // Update lowest_api_price if this is a new low
    const prevLowest = product?.lowest_api_price != null ? Number(product.lowest_api_price) : null;
    if (apiSalePrice != null && (prevLowest == null || apiSalePrice < prevLowest)) {
      updatePayload.lowest_api_price = apiSalePrice;
      updatePayload.lowest_api_price_seen_at = now;
    }

    // Enrich metadata if returned
    if (apiResult.brand)     updatePayload.brand     = apiResult.brand;
    if (apiResult.image_url) updatePayload.image_url = apiResult.image_url;
    if (apiResult.pdp_url)   updatePayload.pdp_url   = apiResult.pdp_url;
    if (apiResult.rating)    updatePayload.rating    = apiResult.rating;
  }

  if (ledgerPrice != null) {
    const prevLowestReceipt =
      product?.lowest_receipt_price != null ? Number(product.lowest_receipt_price) : null;
    if (prevLowestReceipt == null || ledgerPrice < prevLowestReceipt) {
      updatePayload.lowest_receipt_price = ledgerPrice;
      updatePayload.lowest_receipt_price_seen_at = now;
    }
  }

  await supabase.from('products').update(updatePayload).eq('sku', sku);

  return {
    current_price: bestPrice,
    api_sale_price: apiSalePrice,
    api_list_price: apiResult?.list_price ?? null,
    api_online_price: apiResult?.online_price ?? null,
    lowest_receipt_price: ledgerPrice,
    source: ledgerPrice != null && ledgerPrice <= (apiSalePrice ?? Infinity)
      ? 'ocr_ledger'
      : apiSource,
    brand: apiResult?.brand,
    image_url: apiResult?.image_url,
    pdp_url: apiResult?.pdp_url,
    rating: apiResult?.rating,
  };
}

// ---------------------------------------------------------------------------
// Update the receipt-level lowest_receipt_price for a single item.
// Called during receipt ingestion so the ledger is always up-to-date.
// ---------------------------------------------------------------------------

async function updateReceiptLedger(
  supabase: SupabaseClient,
  sku: string,
  netPaid: number,
) {
  const now = new Date().toISOString();
  const { data: product } = await supabase
    .from('products')
    .select('lowest_receipt_price')
    .eq('sku', sku)
    .maybeSingle();

  const prev =
    product?.lowest_receipt_price != null ? Number(product.lowest_receipt_price) : null;

  if (prev == null || netPaid < prev) {
    await supabase
      .from('products')
      .update({ lowest_receipt_price: netPaid, lowest_receipt_price_seen_at: now })
      .eq('sku', sku);
  }
}

// ---------------------------------------------------------------------------
// Expo Push API — client lives in ../_shared/expoPush.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main handler
//
// Modes:
//   { receipt_id, user_id }  — inline check after a receipt scan
//   { sweep: true }           — pg_cron daily 30-day window sweep
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const apiKey = Deno.env.get('RAPIDAPI_KEY') ?? '';

    const body = await req.json();
    const { receipt_id, user_id, sweep } = body as {
      receipt_id?: string;
      user_id?: string;
      sweep?: boolean;
    };

    let items: ItemToCheck[] = [];

    if (sweep) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('receipt_items')
        .select('id, receipt_id, sku, description, unit_price, discount_amount, receipts(user_id)')
        .gte('transaction_date', since);

      if (error) throw error;
      items = (data ?? [])
        .map((r: SweepItemRow) => ({
          receipt_item_id: r.id,
          receipt_id: r.receipt_id,
          user_id: (r.receipts as { user_id?: string } | null)?.user_id ?? '',
          sku: r.sku,
          description: r.description ?? r.sku,
          net_paid: Number(r.unit_price) - Number(r.discount_amount ?? 0),
        }))
        .filter((i: ItemToCheck) => i.user_id);

    } else if (receipt_id && user_id) {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('id, sku, description, unit_price, discount_amount')
        .eq('receipt_id', receipt_id);

      if (error) throw error;
      items = (data ?? []).map((r: ReceiptItemRow) => ({
        receipt_item_id: r.id,
        receipt_id,
        user_id,
        sku: r.sku,
        description: r.description ?? r.sku,
        net_paid: Number(r.unit_price) - Number(r.discount_amount ?? 0),
      }));

    } else {
      return new Response(
        JSON.stringify({ error: 'Provide receipt_id + user_id, or sweep: true' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    console.log(`price-match-check: ${items.length} items, sweep=${sweep ?? false}`);

    // Cache notification prefs per user_id to avoid repeat DB lookups in sweep mode
    type NotifyPrefs = { pushToken: string | null; emailAlerts: boolean };
    const prefsCache = new Map<string, NotifyPrefs>();

    const getNotifyPrefs = async (uid: string): Promise<NotifyPrefs> => {
      if (prefsCache.has(uid)) return prefsCache.get(uid)!;
      const { data } = await supabase
        .from('profiles')
        .select('push_token, email_alerts_enabled')
        .eq('id', uid)
        .maybeSingle();
      const prefs = {
        pushToken: data?.push_token ?? null,
        emailAlerts: data?.email_alerts_enabled ?? false,
      };
      prefsCache.set(uid, prefs);
      return prefs;
    };

    let alertsCreated = 0;
    let noDataCount = 0;
    const pushMessages: ExpoPushMessage[] = [];
    const notifiedAlertIds: string[] = [];
    // New drops per user, for one summary email per user per run.
    const emailBatches = new Map<string, { alertIds: string[]; total: number }>();

    for (const item of items) {
      await updateReceiptLedger(supabase, item.sku, item.net_paid);

      const result = await resolvePrice(supabase, item.sku, apiKey);

      if (!result) {
        noDataCount++;
        continue;
      }

      const delta = item.net_paid - result.current_price;
      if (delta <= 0.01) continue;

      // The daily sweep re-finds every still-valid drop. Only notify when the
      // drop is new or the price fell further since the last alert — this used
      // to reset notified_at on every upsert, re-sending the same push daily.
      const { data: existing } = await supabase
        .from('price_alerts')
        .select('delta')
        .eq('receipt_item_id', item.receipt_item_id)
        .maybeSingle();
      const isNewDrop = !existing || delta > Number(existing.delta) + 0.01;

      const { data: alertRow, error: alertError } = await supabase
        .from('price_alerts')
        .upsert(
          {
            user_id: item.user_id,
            receipt_item_id: item.receipt_item_id,
            sku: item.sku,
            paid_price: item.net_paid,
            current_price: result.current_price,
            delta,
            source: result.source === 'cache' ? 'rapidapi' : result.source,
            // Upsert only overwrites the columns given, so a repeat finding
            // keeps its delivery stamps (and a dismissal); a new/deeper drop
            // clears them so every channel fires again and the alert reappears.
            ...(isNewDrop
              ? { notified_at: null, emailed_at: null, texted_at: null, dismissed_at: null }
              : {}),
          },
          { onConflict: 'receipt_item_id' },
        )
        .select('id')
        .single();

      if (alertError) {
        console.error(`Alert upsert error SKU ${item.sku}:`, alertError.message);
        continue;
      }

      if (!isNewDrop) continue;

      alertsCreated++;
      console.log(
        `Alert: SKU ${item.sku} paid $${item.net_paid} → now $${result.current_price}` +
        ` (Δ $${delta.toFixed(2)}) via ${result.source}`,
      );

      const { pushToken, emailAlerts } = await getNotifyPrefs(item.user_id);

      if (emailAlerts) {
        const batch = emailBatches.get(item.user_id) ?? { alertIds: [], total: 0 };
        batch.alertIds.push(alertRow.id);
        batch.total += delta;
        emailBatches.set(item.user_id, batch);
      }

      // Queue a push notification if the user has a token
      if (pushToken) {
        // Truncate long product names to fit notification body
        const name = item.description.length > 60
          ? item.description.slice(0, 57) + '…'
          : item.description;

        pushMessages.push({
          to: pushToken,
          title: `Price Drop — You may be owed $${delta.toFixed(2)}`,
          body: `${name} dropped from $${item.net_paid.toFixed(2)} to $${result.current_price.toFixed(2)}. You may qualify for a price adjustment.`,
          sound: 'default',
          channelId: 'price-alerts',
          data: {
            receiptId: item.receipt_id,
            receiptItemId: item.receipt_item_id,
            alertId: alertRow.id,
          },
        });
        notifiedAlertIds.push(alertRow.id);
      }
    }

    // Send all pushes in batch, then stamp notified_at
    if (pushMessages.length > 0) {
      await sendExpoPushNotifications(pushMessages);

      // Mark alerts as notified so they don't fire again on the next sweep
      await supabase
        .from('price_alerts')
        .update({ notified_at: new Date().toISOString() })
        .in('id', notifiedAlertIds);

      console.log(`Sent ${pushMessages.length} push notifications`);
    }

    // One email per user per run, summing their new drops. Failures are logged
    // and leave emailed_at null; they never fail the run.
    let emailsSent = 0;
    for (const [uid, batch] of emailBatches) {
      const { data: userData } = await supabase.auth.admin.getUserById(uid);
      const to = userData?.user?.email;
      if (!to) continue;

      const unsub = await unsubscribeUrl(uid);
      const { subject, html, text } = buildPriceDropEmail(batch.alertIds.length, batch.total, unsub);
      const sent = await sendBrevoEmail({
        to,
        subject,
        html,
        text,
        tags: ['price-drop'],
        // One-click unsubscribe (RFC 8058) — Gmail/Yahoo show an Unsubscribe
        // button for it, and require it of bulk senders.
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (sent) {
        emailsSent++;
        await supabase
          .from('price_alerts')
          .update({ emailed_at: new Date().toISOString() })
          .in('id', batch.alertIds);
      }
    }

    return new Response(
      JSON.stringify({
        checked: items.length,
        alerts_created: alertsCreated,
        pushes_sent: pushMessages.length,
        emails_sent: emailsSent,
        no_data: noDataCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('price-match-check error:', message);
    await capturePostHogException(err, { functionName: 'price-match-check' });
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
