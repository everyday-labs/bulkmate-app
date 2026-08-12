-- Open Food Facts is now the primary ingredient-classification source
-- (see EXTERNAL_APIS.md) — it provides real structured signals (NOVA
-- processing group, Nutri-Score, additive E-codes, high/low nutrient
-- flags) instead of guessing from free text. USDA FDC remains a fallback
-- for raw ingredient text only, when OFF has no match for a UPC.
--
-- ingredients_json now stores { items, productFlags } instead of a flat
-- items array — existing cached rows are simply treated as a cache miss
-- (ingredients_updated_at is not touched, so they age out naturally within
-- the existing 30-day TTL rather than needing a backfill).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS nova_group       SMALLINT,  -- 1-4, Open Food Facts processing classification
  ADD COLUMN IF NOT EXISTS nutriscore_grade TEXT;       -- 'a'..'e', Open Food Facts / Nutri-Score

COMMENT ON COLUMN products.ingredients_source IS
  'Where the cached ingredients_text/ingredients_json came from: off | fdc | none';
