import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  classifyFromOpenFoodFacts,
  classifyByKeyword,
  type ClassifiedIngredient,
  type IngredientTally,
  type ProductFlag,
} from '../_shared/ingredientRules.ts';
import { fetchFromRapidApi } from '../_shared/rapidApi.ts';
import { fetchProductByUpc } from '../_shared/usdaFdc.ts';
import { fetchOffProduct } from '../_shared/openFoodFacts.ts';
import { capturePostHogException } from '../_shared/posthog.ts';

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
  ingredients: {
    text: string | null;
    items: ClassifiedIngredient[];
    productFlags: ProductFlag[];
    tally: IngredientTally;
    novaGroup: number | null;
    nutriscoreGrade: string | null;
    // 'off' = real structured classification (NOVA/Nutri-Score/additives).
    // 'fdc' = raw-text-only fallback, keyword-classified, lower confidence.
    source: 'off' | 'fdc' | 'none';
  };
  // 'partial' = no RapidAPI price match, but ingredients and/or OCR price
  // history had something worth returning instead of a flat 404.
  source: 'cache' | 'rapidapi' | 'partial';
};

// ---------------------------------------------------------------------------
// Pricing cache policy (the RapidAPI client itself lives in
// ../_shared/rapidApi.ts, shared with price-match-check)
// ---------------------------------------------------------------------------

const CACHE_TTL_HOURS = 72;

// ---------------------------------------------------------------------------
// OCR ledger price history for this SKU across all receipts
// ---------------------------------------------------------------------------

async function fetchOCRHistory(supabase: SupabaseClient, sku: string) {
  const { data } = await supabase
    .from('receipt_items')
    .select('unit_price, discount_amount, transaction_date')
    .eq('sku', sku)
    .order('transaction_date', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) {
    return { count: 0, min_price: null, max_price: null, avg_price: null, last_seen: null };
  }

  const netPrices = data.map(
    (r: { unit_price: number; discount_amount: number | null }) =>
      Number(r.unit_price) - Number(r.discount_amount ?? 0),
  );
  const min_price = Math.min(...netPrices);
  const max_price = Math.max(...netPrices);
  const avg_price = netPrices.reduce((s, v) => s + v, 0) / netPrices.length;
  const last_seen = data[0].transaction_date;

  return { count: data.length, min_price, max_price, avg_price: Math.round(avg_price * 100) / 100, last_seen };
}

// ---------------------------------------------------------------------------
// Ingredients — resolves + caches + classifies.
//
// Order: Open Food Facts (real structured data — NOVA, Nutri-Score,
// detected additives, nutrient levels) → USDA FDC (raw text only, weaker
// keyword-based fallback) → nothing. See EXTERNAL_APIS.md.
//
// Cached for 30 days — much longer than pricing — since ingredient/
// classification data changes far less often than price.
// ---------------------------------------------------------------------------

const INGREDIENTS_CACHE_TTL_DAYS = 30;

type IngredientsResult = {
  text: string | null;
  items: ClassifiedIngredient[];
  productFlags: ProductFlag[];
  tally: IngredientTally;
  novaGroup: number | null;
  nutriscoreGrade: string | null;
  source: 'off' | 'fdc' | 'none';
  // Used as a fallback name/brand when RapidAPI has no pricing for this UPC
  // (see the "partial hit" path below). Only populated on a fresh fetch,
  // not reconstructed from cache, since it's a one-time fallback rather
  // than something we need to keep re-serving.
  fallbackName: string | null;
  fallbackBrand: string | null;
};

const EMPTY_INGREDIENTS: IngredientsResult = {
  text: null,
  items: [],
  productFlags: [],
  tally: { good: 0, watch: 0, avoid: 0 },
  novaGroup: null,
  nutriscoreGrade: null,
  source: 'none',
  fallbackName: null,
  fallbackBrand: null,
};

// Strips the internal fallbackName/fallbackBrand fields before an
// IngredientsResult goes into the public API response — those are only used
// server-side to build the "partial hit" response below.
function publicIngredients(result: IngredientsResult): ProductResponse['ingredients'] {
  return {
    text: result.text,
    items: result.items,
    productFlags: result.productFlags,
    tally: result.tally,
    novaGroup: result.novaGroup,
    nutriscoreGrade: result.nutriscoreGrade,
    source: result.source,
  };
}

// The subset of a `products` row resolveIngredients reads from the cache.
type CachedIngredientsRow = {
  name: string | null;
  brand: string | null;
  ingredients_text: string | null;
  ingredients_json: { items?: unknown; productFlags?: unknown } | unknown[] | null;
  ingredients_source: string | null;
  ingredients_updated_at: string | null;
  nova_group: number | null;
  nutriscore_grade: string | null;
};

async function resolveIngredients(
  supabase: SupabaseClient,
  sku: string,
  cached: CachedIngredientsRow | null,
  fdcApiKey: string,
): Promise<IngredientsResult> {
  // 1. Cache hit
  const cachedAt = cached?.ingredients_updated_at;
  if (cachedAt) {
    const ageDays = (Date.now() - new Date(cachedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < INGREDIENTS_CACHE_TTL_DAYS) {
      if (cached.ingredients_source === 'none') return EMPTY_INGREDIENTS;

      // Pre-2026-08-07 rows stored ingredients_json as a flat array
      // (`[{name,flag,reason}]`); the current shape is
      // `{ items, productFlags }`. A flat array has no `.items` property,
      // so treating it as the current shape silently produced an empty
      // ingredients card instead of a real cache miss — every such row
      // looked like "no ingredients data" for up to 30 days. Detect the
      // old shape and fall through to refetch instead, which also
      // self-heals the row into the current format on the next write below.
      const stored = cached.ingredients_json;
      const isCurrentFormat = stored != null && !Array.isArray(stored) && Array.isArray(stored.items);

      if (isCurrentFormat) {
        const items = stored.items as ClassifiedIngredient[];
        const productFlags = (stored.productFlags ?? []) as ProductFlag[];
        const t = items.reduce(
          (acc: IngredientTally, item: ClassifiedIngredient) => {
            acc[item.flag as keyof IngredientTally]++;
            return acc;
          },
          { good: 0, watch: 0, avoid: 0 },
        );
        return {
          text: cached.ingredients_text ?? null,
          items,
          productFlags,
          tally: t,
          novaGroup: cached.nova_group ?? null,
          nutriscoreGrade: cached.nutriscore_grade ?? null,
          source: (cached.ingredients_source as 'off' | 'fdc') ?? 'off',
          fallbackName: cached.name ?? null,
          fallbackBrand: cached.brand ?? null,
        };
      }
      // else: old-format or missing — fall through to refetch below.
    }
  }

  const now = new Date().toISOString();

  // 2. Primary — Open Food Facts (real structured classification)
  const offResult = await fetchOffProduct(sku);
  if (offResult) {
    const { items, productFlags, tally } = classifyFromOpenFoodFacts(offResult);

    const upsertPayload: Record<string, unknown> = {
      sku,
      ingredients_text: offResult.ingredientsText,
      ingredients_json: { items, productFlags },
      ingredients_source: 'off',
      ingredients_updated_at: now,
      nova_group: offResult.novaGroup,
      nutriscore_grade: offResult.nutriscoreGrade,
    };
    if (offResult.name) upsertPayload.name = offResult.name;
    if (offResult.brand) upsertPayload.brand = offResult.brand;
    await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });

    return {
      text: offResult.ingredientsText,
      items,
      productFlags,
      tally,
      novaGroup: offResult.novaGroup,
      nutriscoreGrade: offResult.nutriscoreGrade,
      source: 'off',
      fallbackName: offResult.name,
      fallbackBrand: offResult.brand,
    };
  }

  // 3. Fallback — USDA FDC (raw text only, weaker keyword classification)
  if (fdcApiKey) {
    const fdcResult = await fetchProductByUpc(sku, fdcApiKey);
    if (fdcResult?.ingredients) {
      const { items, tally } = classifyByKeyword(fdcResult.ingredients);

      const upsertPayload: Record<string, unknown> = {
        sku,
        ingredients_text: fdcResult.ingredients,
        ingredients_json: { items, productFlags: [] },
        ingredients_source: 'fdc',
        ingredients_updated_at: now,
        nova_group: null,
        nutriscore_grade: null,
      };
      if (fdcResult.name) upsertPayload.name = fdcResult.name;
      if (fdcResult.brand) upsertPayload.brand = fdcResult.brand;
      await supabase.from('products').upsert(upsertPayload, { onConflict: 'sku' });

      return {
        text: fdcResult.ingredients,
        items,
        productFlags: [],
        tally,
        novaGroup: null,
        nutriscoreGrade: null,
        source: 'fdc',
        fallbackName: fdcResult.name,
        fallbackBrand: fdcResult.brand,
      };
    }
  }

  // 4. Neither source had anything
  await supabase.from('products').upsert(
    { sku, ingredients_source: 'none', ingredients_updated_at: now },
    { onConflict: 'sku' },
  );
  return EMPTY_INGREDIENTS;
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
  supabase: SupabaseClient,
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
  let cleanSku: string | undefined;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const apiKey = Deno.env.get('RAPIDAPI_KEY') ?? '';
    const fdcApiKey = Deno.env.get('USDA_FDC_API_KEY') ?? '';

    const { sku } = await req.json() as { sku: string };
    if (!sku?.trim()) {
      return new Response(
        JSON.stringify({ error: 'sku is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    cleanSku = sku.trim();

    // 1. Fetch cache + OCR history in parallel
    const [{ data: cached }, ocrHistory] = await Promise.all([
      supabase
        .from('products')
        .select('sku, name, brand, image_url, pdp_url, rating, api_sale_price, api_list_price, api_online_price, api_price_updated_at, ingredients_text, ingredients_json, ingredients_source, ingredients_updated_at, nova_group, nutriscore_grade')
        .eq('sku', cleanSku)
        .maybeSingle(),
      fetchOCRHistory(supabase, cleanSku),
    ]);

    // Ingredients resolve independently of the price cache/API branching
    // below — same response either way, just may hit OFF/FDC on a cache miss.
    const ingredients = await resolveIngredients(supabase, cleanSku, cached, fdcApiKey);

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
          ingredients: publicIngredients(ingredients),
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
    const apiResult = apiKey ? await fetchFromRapidApi(cleanSku, apiKey) : null;

    // 3b. RapidAPI has nothing (no key set, or no match) — a real barcode
    // scan sends a 12-13 digit UPC/EAN, and RapidAPI's search frequently
    // doesn't recognize that format even when OFF/FDC do (verified manually:
    // 3 real UPCs that FDC resolved returned zero RapidAPI results). Rather
    // than discard a successful ingredients/OCR-history lookup behind a flat
    // 404, return whatever we actually have — price fields just come back
    // null and the mobile UI already renders those sections conditionally.
    if (!apiResult) {
      const hasPartialData = ingredients.items.length > 0 || ocrHistory.count > 0;
      if (!hasPartialData) {
        return new Response(
          JSON.stringify({ error: 'Product not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
        );
      }

      const response: ProductResponse = {
        sku: cleanSku,
        name: ingredients.fallbackName ?? cached?.name ?? cleanSku,
        brand: ingredients.fallbackBrand ?? cached?.brand ?? null,
        image_url: cached?.image_url ?? null,
        pdp_url: cached?.pdp_url ?? null,
        rating: null,
        total_reviews: null,
        sale_price: null,
        list_price: null,
        online_price: null,
        savings_amount: null,
        in_warehouse: false,
        ocr_history: ocrHistory,
        ingredients: publicIngredients(ingredients),
        source: 'partial',
      };

      console.log(`barcode-lookup: partial hit (no RapidAPI match) for ${cleanSku} in ${Date.now() - start}ms`);
      recordLookup(supabase, req, response); // fire and forget
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      ingredients: publicIngredients(ingredients),
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
    await capturePostHogException(err, { functionName: 'barcode-lookup', sku: cleanSku });
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
