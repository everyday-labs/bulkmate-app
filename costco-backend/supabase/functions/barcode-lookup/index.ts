import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductResponse = {
  sku: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  pdp_url: string | null;
  rating: number | null;
  total_reviews: number | null;
  sale_price: number | null;
  list_price: number | null;
  online_price: number | null;
  savings_amount: number | null;
  in_warehouse: boolean;
  ocr_history: {
    count: number;
    min_price: number | null;
    max_price: number | null;
    avg_price: number | null;
    last_seen: string | null;
  };
  source: 'cache' | 'rapidapi';
};

// ---------------------------------------------------------------------------
// RapidAPI — Costco Live Data (same API used by price-match-check)
// ---------------------------------------------------------------------------

const RAPIDAPI_HOST = 'costco-live-data.p.rapidapi.com';
const CACHE_TTL_HOURS = 72;

async function fetchFromRapidAPI(query: string, apiKey: string) {
  const url = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(query)}&rows=1`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': apiKey,
    },
  });

  if (!res.ok) {
    console.warn(`RapidAPI ${res.status} for query "${query}"`);
    return null;
  }

  const json = await res.json();
  const products: any[] = json?.products ?? [];
  if (!products.length) return null;

  const p = products[0];

  const sale_price = p.item_location_pricing_salePrice != null
    ? Number(p.item_location_pricing_salePrice)
    : p.price != null ? Number(p.price) : null;

  const list_price = p.item_location_pricing_listPrice != null
    ? Number(p.item_location_pricing_listPrice) : null;

  const online_price = p.item_warehouse_onlinePrice != null
    ? Number(p.item_warehouse_onlinePrice) : null;

  const brand = (Array.isArray(p.Brand_attr) ? p.Brand_attr[0] : null) ?? p.brand ?? null;
  const in_warehouse = p.item_program_eligibility?.includes('InWarehouse') ?? false;

  return {
    // Use item_number as the canonical SKU for Costco
    sku: p.item_number ?? p.ecom_id ?? query,
    name: p.item_name ?? p.name ?? p.description ?? '',
    brand,
    image_url: p.image_url ?? p.item_collateral_primaryimage ?? null,
    pdp_url: p.pdp_url ?? null,
    rating: p.review_rating != null ? Number(p.review_rating) : null,
    total_reviews: p.total_reviews != null ? Number(p.total_reviews) : null,
    sale_price,
    list_price,
    online_price,
    in_warehouse,
  };
}

// ---------------------------------------------------------------------------
// OCR ledger price history for this SKU across all receipts
// ---------------------------------------------------------------------------

async function fetchOCRHistory(supabase: ReturnType<typeof createClient>, sku: string) {
  const { data } = await supabase
    .from('receipt_items')
    .select('unit_price, discount_amount, transaction_date')
    .eq('sku', sku)
    .order('transaction_date', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) {
    return { count: 0, min_price: null, max_price: null, avg_price: null, last_seen: null };
  }

  const netPrices = data.map((r: any) => Number(r.unit_price) - Number(r.discount_amount ?? 0));
  const min_price = Math.min(...netPrices);
  const max_price = Math.max(...netPrices);
  const avg_price = netPrices.reduce((s, v) => s + v, 0) / netPrices.length;
  const last_seen = data[0].transaction_date;

  return { count: data.length, min_price, max_price, avg_price: Math.round(avg_price * 100) / 100, last_seen };
}

// ---------------------------------------------------------------------------
// Main handler
//
// Input: POST { sku: string }
//   sku can be a Costco item number (5-7 digits) or a UPC/EAN barcode (12-13 digits)
//
// Response time targets:
//   Cache hit  → ~50ms  (single DB query)
//   Cache miss → ~400ms (DB miss + RapidAPI call)
// ---------------------------------------------------------------------------

// Record the lookup for the requesting user — non-blocking, best-effort
async function recordLookup(
  supabase: ReturnType<typeof createClient>,
  req: Request,
  product: { sku: string; name: string; brand: string | null; image_url: string | null; sale_price: number | null },
) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return;
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return;
    await supabase.from('product_lookups').insert({
      user_id: user.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      image_url: product.image_url,
      sale_price: product.sale_price,
    });
  } catch {
    // non-critical — never fail the main response
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const apiKey = Deno.env.get('RAPIDAPI_KEY') ?? '';

    const { sku } = await req.json() as { sku: string };
    if (!sku?.trim()) {
      return new Response(
        JSON.stringify({ error: 'sku is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const cleanSku = sku.trim();

    // 1. Fetch cache + OCR history in parallel
    const [{ data: cached }, ocrHistory] = await Promise.all([
      supabase
        .from('products')
        .select('sku, name, brand, image_url, pdp_url, rating, api_sale_price, api_list_price, api_online_price, api_price_updated_at')
        .eq('sku', cleanSku)
        .maybeSingle(),
      fetchOCRHistory(supabase, cleanSku),
    ]);

    // 2. Cache hit path — return immediately for < 350ms
    if (cached?.api_price_updated_at) {
      const ageHours =
        (Date.now() - new Date(cached.api_price_updated_at).getTime()) / (1000 * 60 * 60);

      if (ageHours < CACHE_TTL_HOURS && cached.api_sale_price != null) {
        const sale_price = Number(cached.api_sale_price);
        const list_price = cached.api_list_price != null ? Number(cached.api_list_price) : null;

        const response: ProductResponse = {
          sku: cached.sku,
          name: cached.name ?? cleanSku,
          brand: cached.brand ?? null,
          image_url: cached.image_url ?? null,
          pdp_url: cached.pdp_url ?? null,
          rating: cached.rating != null ? Number(cached.rating) : null,
          total_reviews: null,
          sale_price,
          list_price,
          online_price: cached.api_online_price != null ? Number(cached.api_online_price) : null,
          savings_amount: list_price != null ? Math.max(0, list_price - sale_price) : null,
          in_warehouse: true,
          ocr_history: ocrHistory,
          source: 'cache',
        };

        console.log(`barcode-lookup: cache hit for ${cleanSku} in ${Date.now() - start}ms`);
        recordLookup(supabase, req, response); // fire and forget
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. Cache miss — call RapidAPI
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Product not found in cache and RAPIDAPI_KEY not set' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    const apiResult = await fetchFromRapidAPI(cleanSku, apiKey);

    if (!apiResult) {
      return new Response(
        JSON.stringify({ error: 'Product not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    // 4. Persist to cache
    const now = new Date().toISOString();
    const savings_amount = apiResult.list_price != null && apiResult.sale_price != null
      ? Math.max(0, apiResult.list_price - apiResult.sale_price)
      : null;

    await supabase.from('products').upsert(
      {
        sku: apiResult.sku,
        name: apiResult.name,
        brand: apiResult.brand,
        image_url: apiResult.image_url,
        pdp_url: apiResult.pdp_url,
        rating: apiResult.rating,
        api_sale_price: apiResult.sale_price,
        api_list_price: apiResult.list_price,
        api_online_price: apiResult.online_price,
        api_price_updated_at: now,
        current_price: apiResult.sale_price,
        price_updated_at: now,
      },
      { onConflict: 'sku' },
    );

    const response: ProductResponse = {
      ...apiResult,
      savings_amount,
      ocr_history: ocrHistory,
      source: 'rapidapi',
    };

    console.log(`barcode-lookup: API hit for ${cleanSku} in ${Date.now() - start}ms`);
    recordLookup(supabase, req, response); // fire and forget
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    console.error('barcode-lookup error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
