// Costco Live Data API (RapidAPI) — the app's only source of live Costco
// pricing (no official Costco API exists). Shared by two callers:
//   - barcode-lookup: single-item detail fetch when a user scans a product
//   - price-match-check: background price refresh for price-match alerts
//
// See ../../../EXTERNAL_APIS.md for auth, rate limits, and caching policy.

const RAPIDAPI_HOST = 'costco-live-data.p.rapidapi.com';

// A hung request must not stall barcode-lookup or eat the sweep's time budget.
const TIMEOUT_MS = 8_000;

export type RapidApiProduct = {
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
  in_warehouse: boolean;
};

/**
 * Looks up a single product by Costco item number or UPC/EAN barcode.
 *
 * Returns `null` on any failure — a non-2xx response, no matching products,
 * or a network-level error (DNS, timeout, etc.). This never throws, so a
 * RapidAPI outage degrades to "price unavailable" for the caller rather than
 * failing the whole request; callers should fall back to cached data or the
 * OCR ledger when they get `null` back.
 */
export async function fetchFromRapidApi(query: string, apiKey: string): Promise<RapidApiProduct | null> {
  try {
    const url = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(query)}&rows=1`;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': apiKey,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`RapidAPI ${res.status} for query "${query}"`);
      return null;
    }

    const json = await res.json();
    // Untyped external JSON; fields are validated where they're read below.
    // deno-lint-ignore no-explicit-any
    const products: any[] = json?.products ?? [];
    if (!products.length) return null;

    const p = products[0];

    // Prefer the warehouse sale price; fall back to the generic `price` field.
    const sale_price = p.item_location_pricing_salePrice != null
      ? Number(p.item_location_pricing_salePrice)
      : p.price != null ? Number(p.price) : null;

    const list_price = p.item_location_pricing_listPrice != null
      ? Number(p.item_location_pricing_listPrice) : null;

    const online_price = p.item_warehouse_onlinePrice != null
      ? Number(p.item_warehouse_onlinePrice) : null;

    const brand = (Array.isArray(p.Brand_attr) ? p.Brand_attr[0] : null) ?? p.brand ?? null;
    const in_warehouse = p.item_program_eligibility?.includes('InWarehouse') ?? false;
    const rating = p.review_rating != null
      ? Number(p.review_rating)
      : p.item_ratings != null ? Number(p.item_ratings) : null;

    return {
      // Costco's item_number is the canonical SKU; fall back to ecom_id or
      // the original query if neither is present.
      sku: p.item_number ?? p.ecom_id ?? query,
      name: p.item_name ?? p.name ?? p.description ?? '',
      brand,
      image_url: p.image_url ?? p.item_collateral_primaryimage ?? null,
      pdp_url: p.pdp_url ?? null,
      rating,
      total_reviews: p.total_reviews != null ? Number(p.total_reviews) : null,
      sale_price,
      list_price,
      online_price,
      in_warehouse,
    };
  } catch (err) {
    console.warn(`RapidAPI fetch failed for query "${query}":`, err);
    return null;
  }
}
