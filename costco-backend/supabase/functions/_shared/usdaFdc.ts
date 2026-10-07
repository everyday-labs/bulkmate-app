// USDA FoodData Central — free, official (api.data.gov) source for branded
// packaged-food ingredient statements, looked up by exact UPC/EAN barcode.
// Used only by barcode-lookup, to enrich a scanned product with an
// ingredients list (Costco's own RapidAPI feed has no ingredient data).
//
// See ../../../EXTERNAL_APIS.md for auth, coverage notes from the manual
// spike test, and rate limits.
//
// Important: FDC's `/foods/search` endpoint is full-text search, not a
// structured GTIN filter — searching the raw UPC digits as query text
// reliably surfaces the right product (verified manually: 5/5 exact matches
// across real Kirkland Signature and name-brand items), but nothing on the
// server guarantees an exact match. `fetchProductByUpc` re-checks the
// returned `gtinUpc` against the input before trusting the result.

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

function normalizeUpc(upc: string): string {
  // Strip leading zeros so "0123..." and "123..." compare equal — FDC and
  // barcode scanners aren't always consistent about UPC-A padding.
  return upc.replace(/^0+/, '');
}

export type FdcProduct = {
  ingredients: string | null;
  // FDC's `description` and `brandOwner` double as a fallback product name —
  // useful when RapidAPI has no pricing for this exact UPC (see the "partial
  // hit" path in barcode-lookup/index.ts): a real UPC/EAN barcode scan often
  // doesn't match RapidAPI's search at all, verified manually against 3 real
  // Kirkland UPCs that FDC resolved but RapidAPI returned zero results for.
  name: string | null;
  brand: string | null;
};

/**
 * Looks up a branded food product by exact UPC/EAN barcode. Returns its raw
 * ingredient statement (a single comma-separated string, e.g. "STRAWBERRIES,
 * SUGAR, FRUIT PECTIN") plus a name/brand fallback, or `null` if there's no
 * exact match.
 *
 * Returns `null` — never throws — on any failure: no match, a non-2xx
 * response, or a network-level error. This is an enrichment call, not the
 * primary lookup result, so a USDA outage must never fail the overall
 * product-detail request; callers should treat `null` as "no data available
 * from FDC for this item" and render accordingly.
 */
export async function fetchProductByUpc(upc: string, apiKey: string): Promise<FdcProduct | null> {
  try {
    const url = `${FDC_SEARCH_URL}?query=${encodeURIComponent(upc)}&dataType=Branded&pageSize=1&api_key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`FDC ${res.status} for UPC "${upc}"`);
      return null;
    }

    const json = await res.json();
    // Untyped external JSON; fields are validated where they're read below.
    // deno-lint-ignore no-explicit-any
    const foods: any[] = json?.foods ?? [];
    if (!foods.length) return null;

    const top = foods[0];
    if (normalizeUpc(top.gtinUpc ?? '') !== normalizeUpc(upc)) return null;

    return {
      ingredients: top.ingredients ?? null,
      name: top.description ?? null,
      brand: top.brandOwner ?? null,
    };
  } catch (err) {
    console.warn(`FDC fetch failed for UPC "${upc}":`, err);
    return null;
  }
}
