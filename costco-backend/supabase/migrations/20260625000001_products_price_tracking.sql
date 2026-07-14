-- Expand products table with two separate price tracks:
--   1. receipt_* — lowest net price observed across all user receipt scans (in-store)
--   2. api_*     — latest + lowest price returned by the Costco Live Data API (online/warehouse)
--
-- Keeping them separate lets us know when the OCR ledger is rich enough to
-- stop calling the paid API for a given SKU.

-- API price track (replaces the old generic current_price / price_updated_at)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS api_sale_price       NUMERIC(10, 2),  -- item_location_pricing_salePrice
  ADD COLUMN IF NOT EXISTS api_list_price       NUMERIC(10, 2),  -- item_location_pricing_listPrice
  ADD COLUMN IF NOT EXISTS api_online_price     NUMERIC(10, 2),  -- item_warehouse_onlinePrice
  ADD COLUMN IF NOT EXISTS api_price_updated_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS lowest_api_price         NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS lowest_api_price_seen_at TIMESTAMPTZ,

  -- Receipt / OCR ledger price track (in-store, populated on every receipt upload)
  ADD COLUMN IF NOT EXISTS lowest_receipt_price         NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS lowest_receipt_price_seen_at TIMESTAMPTZ,

  -- Product metadata enriched from API
  ADD COLUMN IF NOT EXISTS brand     TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS pdp_url   TEXT,
  ADD COLUMN IF NOT EXISTS rating    NUMERIC(3, 2);

-- current_price remains as the single best-known price (min of both tracks).
-- price_updated_at remains as the last time current_price was refreshed.
-- Both are still used by price-match-check as the comparison value.

-- Backfill: seed current_price from api_sale_price where it already exists
-- (no-op on a fresh schema, safe to run either way)
UPDATE products
SET current_price    = api_sale_price,
    price_updated_at = api_price_updated_at
WHERE api_sale_price IS NOT NULL
  AND current_price IS NULL;
