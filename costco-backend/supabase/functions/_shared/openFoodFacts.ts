// Open Food Facts — free, open database with real structured food
// classification data (not just raw ingredient text): NOVA processing
// group, Nutri-Score, additive E-codes actually detected in the product,
// and high/low nutrient-level flags computed from real nutrition facts.
// This is the same data foundation consumer apps like Yuka are built on.
//
// Used by barcode-lookup as the *primary* ingredient-classification source
// (USDA FDC is a fallback for raw text only — see usdaFdc.ts). Coverage
// verified manually 2026-08-06: 5/5 real Kirkland UPCs found, plus 1,557
// Kirkland Signature and 567 Costco-brand-tagged products in the database
// via their search API. See ../../../EXTERNAL_APIS.md for details.
//
// Etiquette: Open Food Facts asks all API consumers to send a descriptive
// User-Agent (app name + contact) — anonymous/generic requests get rate
// limited more aggressively, which we hit firsthand while spike-testing.

const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const USER_AGENT = 'CostcoCompanion/1.0 (balajic1992@gmail.com) - Supabase Edge Function';

const FIELDS = [
  'product_name',
  'brands',
  'ingredients_text',
  'nova_group',
  'nutriscore_grade',
  'additives_tags',
  'nutrient_levels_tags',
  'ingredients_analysis_tags',
].join(',');

export type OffProduct = {
  name: string | null;
  brand: string | null;
  ingredientsText: string | null;
  novaGroup: number | null;
  nutriscoreGrade: string | null;
  // Raw E-codes as returned by OFF, e.g. ['en:e330', 'en:e250'] — normalized
  // to bare lowercase codes ('e330') by normalizeAdditiveTags below.
  additives: string[];
  // e.g. ['sugars-in-high-quantity', 'salt-in-low-quantity']
  nutrientLevels: string[];
  palmOil: 'yes' | 'no' | 'unknown';
};

function normalizeAdditiveTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  // OFF prefixes tags with a language code, e.g. "en:e330" — strip it and
  // any "en:" language prefix so callers can match against a plain "e330".
  return tags.map((t) => String(t).replace(/^en:/, '').toLowerCase());
}

function normalizeNutrientLevels(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).replace(/^en:/, '').toLowerCase());
}

function readPalmOil(analysisTags: unknown): 'yes' | 'no' | 'unknown' {
  if (!Array.isArray(analysisTags)) return 'unknown';
  const tags = analysisTags.map((t) => String(t).toLowerCase());
  if (tags.some((t) => t.includes('palm-oil-content-yes') || t === 'en:palm-oil')) return 'yes';
  if (tags.some((t) => t.includes('palm-oil-free') || t.includes('palm-oil-content-no'))) return 'no';
  return 'unknown';
}

/**
 * Looks up a product by exact UPC/EAN barcode. Returns `null` on any
 * failure — no match, a non-2xx response, or a network-level error — never
 * throws. Ingredient classification is an enrichment, not the primary
 * lookup result, so an Open Food Facts outage must never fail the overall
 * product-detail request.
 */
export async function fetchOffProduct(upc: string): Promise<OffProduct | null> {
  try {
    const url = `${OFF_PRODUCT_URL}/${encodeURIComponent(upc)}.json?fields=${FIELDS}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

    if (!res.ok) {
      console.warn(`Open Food Facts ${res.status} for UPC "${upc}"`);
      return null;
    }

    const json = await res.json();
    if (json?.status !== 1 || !json?.product) return null;

    const p = json.product;
    return {
      name: p.product_name || null,
      brand: p.brands || null,
      ingredientsText: p.ingredients_text || null,
      novaGroup: typeof p.nova_group === 'number' ? p.nova_group : null,
      nutriscoreGrade: p.nutriscore_grade && p.nutriscore_grade !== 'unknown' ? p.nutriscore_grade : null,
      additives: normalizeAdditiveTags(p.additives_tags),
      nutrientLevels: normalizeNutrientLevels(p.nutrient_levels_tags),
      palmOil: readPalmOil(p.ingredients_analysis_tags),
    };
  } catch (err) {
    console.warn(`Open Food Facts fetch failed for UPC "${upc}":`, err);
    return null;
  }
}
