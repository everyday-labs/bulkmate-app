-- Extends `warehouses` for a global (not just Bay Area) seed, and adds the
-- columns needed to derive `tier` from a real signal (Google Places rating
-- + review count) instead of a hand-picked guess — see
-- scripts/seed-warehouses-from-google-places.js.

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS country             TEXT DEFAULT 'USA',
  ADD COLUMN IF NOT EXISTS postal_code          TEXT,
  ADD COLUMN IF NOT EXISTS google_place_id      TEXT,
  ADD COLUMN IF NOT EXISTS google_rating        NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS google_rating_count  INTEGER;

-- Backfill existing Bay Area rows explicitly (the column default already
-- covers this for new rows, but makes intent visible for the 15 seeded here).
-- 'USA' to match the format Google Places returns for every seeded row —
-- an earlier version of this migration used 'US' here, which left the 15
-- Bay Area rows inconsistent with the ~700 Places-seeded ones; fixed
-- retroactively for an already-applied DB by
-- 20260809000006_warehouses_data_cleanup.sql.
UPDATE warehouses SET country = 'USA' WHERE country IS NULL;

ALTER TABLE warehouses ALTER COLUMN country SET NOT NULL;

-- Unique so the seed script's ON CONFLICT (google_place_id) upsert works,
-- and so a location never gets inserted twice across re-runs. A plain
-- UNIQUE constraint, not a partial index with a WHERE clause — Postgres
-- already treats every NULL as distinct from every other NULL under a
-- normal unique constraint, so the 15 hand-seeded Bay Area rows (no
-- Google Place ID) are unaffected without needing a predicate. This
-- matters because ON CONFLICT (google_place_id) can only infer a partial
-- index if the same WHERE clause is repeated in the ON CONFLICT clause
-- itself — a plain constraint avoids that trap entirely (a real bug hit in
-- production: the first version of this migration used a partial index,
-- which was live-patched via a since-superseded standalone fix migration;
-- that patch's effect is folded directly into this file now, so there's
-- nothing left to separately apply).
DO $$ BEGIN
  ALTER TABLE warehouses
    ADD CONSTRAINT warehouses_google_place_id_unique UNIQUE (google_place_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN warehouses.postal_code IS
  'Used by ingest-receipt''s city/postal-code fallback matching for GP-coded (Google Places seeded) warehouses — see PARSER_DECISIONS.md. Nullable; the 15 hand-seeded Bay Area rows don''t have one.';

COMMENT ON COLUMN warehouses.google_rating IS
  'Google Places rating at seed time — kept for auditability of how `tier` was derived, not refreshed live.';
COMMENT ON COLUMN warehouses.google_rating_count IS
  'Google Places user_ratings_total at seed time — see google_rating comment.';
