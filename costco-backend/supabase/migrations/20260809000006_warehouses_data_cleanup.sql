-- Cleans up two real data-quality issues found after applying the global
-- warehouse seed (20260809000001 through 20260809000004):
--
-- 1. Country inconsistency: the 15 hand-seeded Bay Area rows say 'US'
--    (from this table's original country default, since fixed in
--    20260809000000_warehouses_global_columns.sql) while every
--    Google-Places-seeded row says 'USA' — same country, two different
--    strings. Normalized to 'USA' to match the ~700 Places-seeded rows,
--    since changing the majority would be far more disruptive.
--
-- 2. Taiwan rows got a postal code stuck onto the country field
--    (country = 'Taiwan 408' instead of country = 'Taiwan' with
--    postal_code = '408') and the wrong city (the district, e.g.
--    "Nantun District", instead of the actual city, e.g. "Taichung
--    City") — Taiwan's Google Places address format has no state/
--    province segment, which the seed script's address parser assumed
--    every country had. Fixed going forward in the script itself
--    (parseAddress's new Taiwan special case); this repairs the rows
--    that were already inserted before that fix existed.

UPDATE warehouses
SET country = 'USA'
WHERE country = 'US';

UPDATE warehouses
SET
  postal_code = substring(country from '^Taiwan\s+(\d+)$'),
  country = 'Taiwan',
  -- The city segment that was actually captured is the district
  -- (e.g. "Nantun District") — recover the real city from `address`,
  -- which is the second-to-last comma-separated segment for every
  -- affected row (format: "..., <District>, <City>, Taiwan <code>").
  city = trim(split_part(address, ',', array_length(string_to_array(address, ','), 1) - 1))
WHERE country ~ '^Taiwan\s+\d+$';
