-- Ingredient data + good/watch/avoid classification, sourced from USDA
-- FoodData Central (exact-UPC lookup — see barcode-lookup function).
-- Cached far longer than pricing (ingredients rarely change) via its own
-- ingredients_updated_at column, independent of api_price_updated_at.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ingredients_text       TEXT,        -- raw comma-separated string from FDC
  ADD COLUMN IF NOT EXISTS ingredients_json        JSONB,       -- classified [{ name, flag, reason }]
  ADD COLUMN IF NOT EXISTS ingredients_source      TEXT,        -- 'off' | 'fdc' | 'none' (no match found)
  ADD COLUMN IF NOT EXISTS ingredients_updated_at  TIMESTAMPTZ;
