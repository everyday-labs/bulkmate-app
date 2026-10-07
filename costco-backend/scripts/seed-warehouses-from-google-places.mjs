#!/usr/bin/env node
// One-time developer tool — NOT called by the running app or any Edge
// Function, and not deployed anywhere. Queries the Google Places Text
// Search API for "Costco Wholesale" across a configurable list of
// region queries, computes a data-driven rarity `tier` from each
// location's real Google rating + review count, and writes a
// ready-to-review SQL file for the `warehouses` table.
//
// Why a real signal instead of guessing: the 15 Bay Area warehouses
// currently in the DB (20260626000001_warehouses_seed.sql) have
// Common/Rare/Legendary assigned by hand, with no documented rationale.
// This script replaces that with: score = rating * ln(review_count + 1),
// top 5% of locations = Legendary, next 20% = Rare, rest = Common.
// Locations with no rating/review data default to Common rather than
// guessing.
//
// ⚠️  IMPORTANT — warehouse_code caveat, read before running:
// Google Places has no concept of Costco's own internal store number
// (the number printed on a receipt, e.g. "#0013"). `ingest-receipt`
// matches a scanned receipt to a warehouse by exactly that number
// (`.eq('warehouse_code', parsed.warehouseCode)` in
// supabase/functions/ingest-receipt/index.ts). This script can only
// assign a SYNTHETIC placeholder code (`GP-000123`) to each warehouse it
// discovers — until you manually correct warehouse_code per row against
// Costco's own official warehouse locator, receipts scanned at any of
// these newly-seeded warehouses will still save fine, they just won't
// auto-link to a warehouse name/tier. The 15 real Bay Area rows already
// in the DB are untouched by this script (matched/updated by
// google_place_id, which they don't have, so they're simply skipped on
// conflict).
//
// Requires the "Places API" enabled + billing on a Google Cloud project
// (separate from the Vision API key already used for OCR — Places is a
// distinct API needing its own enablement even in the same project).
// Text Search is a paid API; this script can issue on the order of 100+
// requests for a full global run (54 US states/DC + a handful of other
// countries, up to 3 paginated requests each). Trim REGION_QUERIES below
// to run a smaller/cheaper batch first if you want to sanity-check the
// output before doing a full sweep.
//
// Usage:
//   GOOGLE_PLACES_API_KEY=xxx node scripts/seed-warehouses-from-google-places.mjs

import { writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Deterministic per-place code — NOT a per-run sequential counter. A
// counter starting at 1 every run (the original approach) collides across
// separate script runs: run 2's brand-new warehouses (different
// google_place_id, so ON CONFLICT (google_place_id) doesn't dedupe them)
// still land on GP-000001, GP-000002... which run 1 already claimed,
// producing "duplicate key value violates unique constraint
// warehouses_warehouse_code_key" in production. Hashing place_id instead
// means the same physical warehouse always gets the same code no matter
// which run discovers it, and different warehouses essentially never
// collide (8 hex chars = ~4.3 billion values for a few thousand rows).
function codeForPlace(placeId) {
  return `GP-${createHash('sha1').update(placeId).digest('hex').slice(0, 8).toUpperCase()}`;
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY is required.');
  console.error(
    'Enable the "Places API" at https://console.cloud.google.com/apis/library/places-backend.googleapis.com, then create a key at https://console.cloud.google.com/apis/credentials',
  );
  process.exit(1);
}

const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  'Puerto Rico',
];

const CANADA_PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Nova Scotia',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
];

// Countries small enough that one query (≤60 results) reliably covers them.
// Extend this list for any country not yet covered — check Costco's own
// "find a warehouse by country" list for what's missing.
const OTHER_COUNTRIES = [
  'United Kingdom',
  'Japan',
  'South Korea',
  'Taiwan',
  'Australia',
  'Mexico',
  'Spain',
  'France',
  'Iceland',
  'China',
  'New Zealand',
  'Sweden',
];

// Regions confirmed (2026-08) to hit Google's next_page_token INVALID_REQUEST
// 100% of the time, even after long retry backoff — this isn't timing
// flakiness, pagination for these specific queries just doesn't work. Split
// into metro-level sub-queries small enough to fit in one page (≤20 results)
// so page 2 is never needed. Best-effort city lists, not guaranteed
// exhaustive — spot-check the output and extend a region's list here if a
// warehouse you know about is still missing after a run.
const SPLIT_REGIONS = {
  'Arizona, USA': ['Phoenix, Arizona', 'Tucson, Arizona', 'Mesa, Arizona'],
  'California, USA': [
    'Los Angeles, California',
    'San Diego, California',
    'Sacramento, California',
    'Fresno, California',
    'Bakersfield, California',
    'San Francisco Bay Area, California',
    'Orange County, California',
    'Inland Empire, California',
  ],
  'Florida, USA': ['Miami, Florida', 'Orlando, Florida', 'Tampa, Florida', 'Jacksonville, Florida'],
  'Illinois, USA': ['Chicago, Illinois', 'Springfield, Illinois'],
  'New Jersey, USA': ['North Jersey, New Jersey', 'South Jersey, New Jersey'],
  'Texas, USA': [
    'Houston, Texas',
    'Dallas, Texas',
    'Fort Worth, Texas',
    'Austin, Texas',
    'San Antonio, Texas',
    'El Paso, Texas',
  ],
  'Washington, USA': ['Seattle, Washington', 'Spokane, Washington', 'Vancouver, Washington'],
  'United Kingdom': [
    'London, United Kingdom',
    'Manchester, United Kingdom',
    'Birmingham, United Kingdom',
    'Glasgow, United Kingdom',
    'Watford, United Kingdom',
  ],
  Japan: [
    'Tokyo, Japan',
    'Osaka, Japan',
    'Fukuoka, Japan',
    'Sendai, Japan',
    'Nagoya, Japan',
    'Sapporo, Japan',
  ],
  Mexico: [
    'Ciudad de Mexico, Mexico',
    'Guadalajara, Mexico',
    'Monterrey, Mexico',
    'Tijuana, Mexico',
    'Puebla, Mexico',
    'Merida, Mexico',
  ],
};

function expandRegion(region) {
  return (SPLIT_REGIONS[region] ?? [region]).map((sub) => `Costco Wholesale in ${sub}`);
}

const ALL_REGION_QUERIES = [
  ...US_STATES.flatMap((s) => expandRegion(`${s}, USA`)),
  ...CANADA_PROVINCES.map((p) => `Costco Wholesale in ${p}, Canada`),
  ...OTHER_COUNTRIES.flatMap((c) => expandRegion(c)),
];

// Optional: REGION_FILTER=Arizona,California,Japan (comma-separated,
// case-insensitive substring match against each query string) restricts
// the run to just those regions — for re-running specific regions that
// came back truncated last time, without paying for a full global sweep
// again. Omit it to run everything, same as before.
const regionFilter = (process.env.REGION_FILTER ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const REGION_QUERIES =
  regionFilter.length === 0
    ? ALL_REGION_QUERIES
    : ALL_REGION_QUERIES.filter((q) => regionFilter.some((f) => q.toLowerCase().includes(f)));

if (regionFilter.length > 0) {
  console.log(
    `REGION_FILTER active — running ${REGION_QUERIES.length} of ${ALL_REGION_QUERIES.length} region queries:`,
  );
  console.log(REGION_QUERIES.map((q) => `  - ${q}`).join('\n'));
}

// Places sometimes lists a warehouse's gas station, pharmacy, tire center,
// or business center as a separate result with "Costco" in the name —
// exclude those so they don't get seeded as their own warehouse.
const EXCLUDE_KEYWORDS = [
  'gas',
  'fuel',
  'pharmacy',
  'tire',
  'business center',
  'car wash',
  'optical',
];

function looksLikeWarehouse(place) {
  const name = (place.name ?? '').toLowerCase();
  if (!name.includes('costco')) return false;
  return !EXCLUDE_KEYWORDS.some((kw) => name.includes(kw));
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

// Google's next_page_token has a real activation delay, and how long varies
// — a fixed ~2s wait (what this script originally used) reliably returns
// INVALID_REQUEST for a meaningful fraction of requests, truncating large
// regions (California, Texas, Japan...) to page 1. Retrying with a longer
// wait after a failure resolves this in practice.
async function fetchPageWithRetry(pagetoken, query) {
  const delays = [3000, 4000, 5000]; // total up to ~12s worst case, only paid when needed
  for (let attempt = 0; attempt < delays.length; attempt++) {
    await new Promise((r) => setTimeout(r, delays[attempt]));
    const json = await fetchJson(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${pagetoken}&key=${API_KEY}`,
    );
    if (json.status === 'OK' || json.status === 'ZERO_RESULTS') return json;
    if (attempt === delays.length - 1) {
      console.warn(
        `  ! "${query}" page 2+: ${json.status} ${json.error_message ?? ''} (gave up after ${delays.length} attempts)`,
      );
      return null;
    }
    console.warn(`  … "${query}" page 2+: ${json.status}, retrying with a longer wait`);
  }
  return null;
}

async function textSearch(query) {
  const results = [];
  let json = await fetchJson(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${API_KEY}`,
  );

  for (let page = 0; page < 3; page++) {
    if (!json || (json.status !== 'OK' && json.status !== 'ZERO_RESULTS')) {
      if (json) console.warn(`  ! "${query}": ${json.status} ${json.error_message ?? ''}`);
      break;
    }

    results.push(...(json.results ?? []));
    if (!json.next_page_token) break;

    json = await fetchPageWithRetry(json.next_page_token, query);
  }

  return results;
}

// Ordered most-specific-first so a distinctive alphanumeric format (Canada,
// UK) is preferred over the generic digit-run fallback used for everywhere
// else (US, Australia, Spain, France, South Korea, Taiwan, China, Iceland...).
const POSTAL_CODE_PATTERNS = [
  /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/, // Canada: K2G 5W5
  /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/, // UK: SW1A 1AA
  /\b\d{3}-\d{4}\b/, // Japan: 135-0063
  /\b\d{5}-\d{4}\b/, // US ZIP+4
  /\b\d{4,6}\b/, // generic fallback
];

function extractPostalCode(segment) {
  for (const pattern of POSTAL_CODE_PATTERNS) {
    const m = segment.match(pattern);
    if (m) return m[0];
  }
  return null;
}

// Best-effort split of Places' formatted_address into city/state/country/
// postal code. Always spot-check a sample of the output — this is a
// heuristic, not a real address parser, and will be wrong for some
// international formats (only city/state can end up swapped when an
// address has fewer comma-separated segments than the US/Canada norm this
// was tuned against — postal code extraction itself is more robust since
// it's pattern-based, not position-based).
function parseAddress(formatted) {
  const parts = (formatted ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const lastSegment = parts[parts.length - 1] ?? '';

  // Taiwan has no state/province segment at all — Google's format is
  // "..., <District>, <City>, Taiwan <postal code>", with the postal code
  // fused onto "Taiwan" in the final segment rather than living in its own
  // segment or the one before it (where every other country's code was
  // found). Handled as a special case rather than folding into the general
  // logic below, since the city is also one position closer to the end here
  // (no state segment to skip past).
  const taiwanMatch = lastSegment.match(/^Taiwan\s+(\d+)$/i);
  if (taiwanMatch) {
    return {
      city: parts[parts.length - 2] ?? null,
      state: null,
      country: 'Taiwan',
      postalCode: taiwanMatch[1],
    };
  }

  const country = lastSegment || null;
  // Google formats this segment as "<state/province> <postal code>" — take
  // just the first token. A trailing-digit strip (like `\d.*$`) breaks on
  // alphanumeric postal codes (Canada's "ON K2G 5W5" strips to "ON K").
  const stateZip = parts[parts.length - 2] ?? '';
  const state = stateZip.trim().split(/\s+/)[0] || null;
  const citySegment = parts[parts.length - 3] ?? '';

  // Mexico (and some other countries) put the postal code *before* the
  // city rather than after the state, e.g. "11500 Ciudad de México" — check
  // the state/zip segment first, then fall back to the city segment.
  const postalCode = extractPostalCode(stateZip) ?? extractPostalCode(citySegment);
  const city = citySegment.replace(postalCode ?? '', '').trim() || citySegment || null;

  return { city, state, country, postalCode };
}

function sqlString(value) {
  return value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const byPlaceId = new Map();

  for (const query of REGION_QUERIES) {
    console.log(`Searching: ${query}`);
    const results = await textSearch(query);
    let added = 0;
    for (const place of results) {
      if (!looksLikeWarehouse(place)) continue;
      if (byPlaceId.has(place.place_id)) continue;
      byPlaceId.set(place.place_id, place);
      added++;
    }
    console.log(`  +${added} (running total: ${byPlaceId.size})`);
    // Stay well under Places' rate limits between region queries.
    await new Promise((r) => setTimeout(r, 200));
  }

  const places = [...byPlaceId.values()];
  console.log(`\nFound ${places.length} unique Costco locations.`);
  if (places.length === 0) {
    console.log('Nothing to write — check your API key and that the Places API is enabled.');
    return;
  }

  // ---- rarity scoring ----
  const scored = places.map((place) => {
    const rating = place.rating ?? 0;
    const count = place.user_ratings_total ?? 0;
    const score = rating * Math.log(count + 1);
    return { place, rating, count, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const n = scored.length;
  const legendaryCutoff = Math.ceil(n * 0.05);
  const rareCutoff = Math.ceil(n * 0.25); // top 5% + next 20%

  for (const [i, s] of scored.entries()) {
    if (s.score === 0) {
      s.tier = 'Common';
      continue;
    } // no data — don't guess
    if (i < legendaryCutoff) s.tier = 'Legendary';
    else if (i < rareCutoff) s.tier = 'Rare';
    else s.tier = 'Common';
  }

  // ---- write SQL ----
  const rows = scored.map((s) => {
    const { place, rating, count, tier } = s;
    const { city, state, country, postalCode } = parseAddress(place.formatted_address);
    const code = codeForPlace(place.place_id);
    const lat = place.geometry?.location?.lat;
    const lng = place.geometry?.location?.lng;

    return (
      `  (${sqlString(code)}, ${sqlString(place.name)}, ${sqlString(place.formatted_address)}, ` +
      `${sqlString(city)}, ${sqlString(state)}, ${sqlString(country)}, ${sqlString(postalCode)}, ${lat}, ${lng}, ` +
      `'${tier}', ${sqlString(place.place_id)}, ${rating || 'NULL'}, ${count || 'NULL'})`
    );
  });

  const sql = [
    '-- Auto-generated by costco-backend/scripts/seed-warehouses-from-google-places.mjs',
    `-- Generated ${new Date().toISOString()} — ${rows.length} locations found via Google Places Text Search.`,
    '--',
    '-- Filename already has a real timestamp prefix (Supabase requires the exact',
    '-- pattern <14-digit-timestamp>_name.sql or it silently skips the migration) —',
    '-- review the contents below, then apply as-is.',
    '--',
    "-- ⚠️  warehouse_code is a SYNTHETIC placeholder (GP-######), not Costco's",
    "-- real internal store number — see the script's header comment for what",
    '-- this means for receipt auto-matching.',
    '--',
    '-- tier is derived from rating * ln(review_count + 1): top 5% = Legendary,',
    '-- next 20% = Rare, rest = Common. Review a sample of city/state/country/',
    '-- postal_code before applying — address parsing is a best-effort heuristic.',
    "-- postal_code feeds ingest-receipt's warehouse-matching fallback (see",
    "-- PARSER_DECISIONS.md) — it's the main thing worth spot-checking closely,",
    '-- since a wrong postal code means a receipt silently fails to link.',
    '',
    'INSERT INTO warehouses (warehouse_code, name, address, city, state, country, postal_code, latitude, longitude, tier, google_place_id, google_rating, google_rating_count)',
    'VALUES',
    rows.join(',\n') + '',
    'ON CONFLICT (google_place_id) DO UPDATE',
    '  SET tier = EXCLUDED.tier,',
    '      postal_code = EXCLUDED.postal_code,',
    '      google_rating = EXCLUDED.google_rating,',
    '      google_rating_count = EXCLUDED.google_rating_count;',
    '',
  ].join('\n');

  // Supabase's migration runner requires an exact "<14-digit-timestamp>_name.sql"
  // filename, applied in filename-sort order — a real timestamp isn't enough
  // on its own: this script's wall-clock time can land *before* a schema
  // migration you wrote moments earlier in the editor (sandboxed/dev clocks
  // don't always line up with edit order), and a seed file that sorts before
  // 20260809000000_warehouses_global_columns.sql fails with "column
  // postal_code does not exist" — hit exactly this the first time this ran.
  // Fix: never generate a timestamp earlier than any migration already on
  // disk — take whichever is later, "now" or (latest existing + 1 second).
  const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
  const existingTimestamps = readdirSync(migrationsDir)
    .map((f) => f.match(/^(\d{14})_/)?.[1])
    .filter(Boolean)
    .map(BigInt);
  const nowTs = BigInt(new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14));
  const latestExisting = existingTimestamps.length
    ? existingTimestamps.reduce((a, b) => (b > a ? b : a))
    : 0n;
  const ts = (nowTs > latestExisting ? nowTs : latestExisting + 1n).toString();

  const outPath = fileURLToPath(
    new URL(`../supabase/migrations/${ts}_warehouses_global_seed.sql`, import.meta.url),
  );
  writeFileSync(outPath, sql);

  const tierCounts = { Legendary: 0, Rare: 0, Common: 0 };
  for (const s of scored) tierCounts[s.tier]++;

  console.log(`\nWrote ${rows.length} warehouses to:\n  ${outPath}`);
  console.log('Tier breakdown:', tierCounts);
  console.log('\nNext steps:');
  console.log(
    '  1. Spot-check the generated file — especially city/state/country/postal_code parsing.',
  );
  console.log('  2. Run it via the Supabase SQL editor, same as every other migration here.');
  console.log('  3. warehouse_code corrects itself as real receipts get scanned at each');
  console.log("     warehouse (see ingest-receipt's postal-code/city fallback matching) —");
  console.log('     no manual per-row correction needed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
