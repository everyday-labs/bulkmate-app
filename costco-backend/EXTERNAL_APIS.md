# External APIs

Every third-party API this app calls, where it's called from, and what happens
when it fails. All seven clients live in `supabase/functions/_shared/` — one
file per API — so there's a single canonical place to look for "how do we
call X" regardless of which Edge Function needs it.

| API | Client file | Called from | Auth | Cost |
|---|---|---|---|---|
| Google Cloud Vision | `_shared/googleVision.ts` | `ingest-receipt` | API key | Paid, per-image |
| RapidAPI — Costco Live Data | `_shared/rapidApi.ts` | `barcode-lookup`, `price-match-check` | API key (header) | Paid, per-request (RapidAPI plan) |
| Open Food Facts | `_shared/openFoodFacts.ts` | `barcode-lookup` | None (User-Agent required) | Free |
| USDA FoodData Central | `_shared/usdaFdc.ts` | `barcode-lookup` (fallback only) | API key (query param) | Free |
| Expo Push API | `_shared/expoPush.ts` | `price-match-check` | None (device push token) | Free |
| Brevo (email + SMS) | `_shared/brevo.ts` | `price-match-check`, `weekly-price-texts`, `phone-verification` | API key (header) | Email free up to 300/day; SMS paid credits |
| PostHog | `_shared/posthog.ts` | All 4 functions (top-level catch) | Project token | Free tier |

No official Costco API exists — `api.costco.com` and other Costco-internal
endpoints are session-cookie protected and must never be called directly (see
`CLAUDE.md`). Everything above is either a licensed third-party data feed
(RapidAPI), a public/open dataset (Open Food Facts, USDA), or infrastructure
(Vision, Expo Push, PostHog).

---

## Google Cloud Vision

**What it's for:** OCR on receipt photos — turns a captured image into raw
text, which `ingest-receipt/parser.ts` then parses into line items.

**Endpoint:** `POST https://vision.googleapis.com/v1/images:annotate`
(`DOCUMENT_TEXT_DETECTION` feature)

**Auth:** API key as a query param (`GOOGLE_CLOUD_VISION_API_KEY` secret).

**Fallback on failure:** **None — intentionally.** OCR is the entire input to
the receipt pipeline, not an enrichment; if we can't read the receipt there's
nothing to fall back to. `extractTextFromImage` throws, `ingest-receipt`'s
top-level `catch` turns that into a clean error response, and the mobile app
shows a retry prompt. See `_shared/googleVision.ts` for the reasoning.

**Cost:** Paid per image (Google Cloud Vision pricing). This is the most
expensive call in the app per-use — one call per receipt scan, not cached
(each receipt image is different).

---

## RapidAPI — Costco Live Data

**What it's for:** The only source of live Costco pricing (name, price,
image, rating). Used for two different jobs:
- `barcode-lookup` — full product detail when a user scans an item
- `price-match-check` — background price refresh to detect price drops

**Endpoint:** `GET https://costco-live-data.p.rapidapi.com/search?query=<sku-or-upc>&rows=1`

**Auth:** `x-rapidapi-key` header (`RAPIDAPI_KEY` secret).

**Known limitation, verified against the live deployed function (2026-08-06):**
this API's `query` param does **not** reliably match on raw 12-13 digit
UPC/EAN barcodes — the exact format a real camera scan produces. Tested 3
real UPCs that USDA FDC resolved correctly; RapidAPI returned zero results
for all 3. It appears to expect a Costco item number (5-7 digits) or product
name, not a scanned barcode. Practical effect: a meaningful share of real
barcode scans will get no RapidAPI match even for items Costco actually
carries. `barcode-lookup` now handles this (see "Fallback on failure" below)
rather than treating it as "product not found," but real coverage — what
fraction of scans actually hit this — hasn't been measured yet.

**Caching:** Both callers cache the result in `products.api_sale_price` /
`api_price_updated_at` (and related columns) for **72 hours** before calling
RapidAPI again for the same SKU — this is the main cost control, since it's a
paid-per-request API.

**Fallback on failure:** `fetchFromRapidApi` never throws — a non-2xx
response, an empty result, or a network-level error (timeout, DNS, etc.) all
resolve to `null`. Callers degrade differently depending on what else they
have:
- `barcode-lookup`: if RapidAPI has nothing, it now returns a **partial
  response** (`source: 'partial'`) instead of a flat 404 — as long as either
  the ingredients lookup (Open Food Facts or USDA FDC) or the OCR
  price-history ledger has something. Name/brand fall back to whichever
  ingredient source resolved in that case; all price fields come back `null`
  and the mobile UI renders those sections conditionally, so nothing crashes
  on the missing data. Only returns an actual 404 if *none* of RapidAPI,
  Open Food Facts, USDA, and the OCR ledger have anything.
- `price-match-check`: falls back to the **OCR ledger** (median price other
  users have actually paid in-store, from `receipt_items`) if RapidAPI has
  nothing. Only returns null (skip this item) if both are empty.

**Cost:** Paid per RapidAPI plan — this is why the 72h cache exists.

---

## Open Food Facts

**What it's for:** The **primary** source for ingredient classification —
real structured data, not free-text guessing. Returns NOVA processing group
(1-4), Nutri-Score (A-E, the actual front-of-pack label used in France/EU),
the specific additive E-codes detected in the product, and high/low
nutrient-level flags computed from the product's real nutrition facts. This
is the same data foundation the consumer app Yuka is built on.

**Endpoint:** `GET https://world.openfoodfacts.org/api/v2/product/<upc>.json?fields=...`
— a real barcode-keyed lookup, not a full-text search hack like FDC's below.

**Auth:** None required, but Open Food Facts asks all consumers to send a
descriptive `User-Agent` header (app name + contact) — anonymous/generic
requests get rate-limited more aggressively, which we hit firsthand while
spike-testing with a bare `curl`. `_shared/openFoodFacts.ts` always sends one.

**Coverage, verified manually 2026-08-06 (not assumed):**
- 5/5 individual real Kirkland Signature UPCs found, each with usable
  NOVA/Nutri-Score/additive data.
- 1,557 Kirkland Signature products and 567 Costco-brand-tagged products
  total in the database, via their brand-search API.
- Real coverage across a typical full shopping basket hasn't been measured
  — this is strong signal, not a guarantee for every SKU.

**Classification:** `_shared/additiveDatabase.ts` is a curated table mapping
~25 specific E-codes (only ones with documented regulatory action or
research-flagged concern — most additives, like citric acid or lecithin, are
deliberately left unflagged) to a flag + plain-language reason.
`classifyFromOpenFoodFacts` in `_shared/ingredientRules.ts` cross-references
OFF's *detected* `additives_tags` against that table — so the app knows
exactly which additives are actually present, rather than guessing from label
wording. NOVA 4, Nutri-Score D/E, high-sugar/salt/fat, and palm-oil content
each add a product-level flag alongside the per-ingredient ones. Still a
curated judgment call about what's worth flagging, not a certified medical
rating — same caveat as before, just anchored to real detected data now.

**Caching:** 30 days, same as before, in `products.ingredients_*` plus new
`nova_group`/`nutriscore_grade` columns.

**Fallback on failure:** `fetchOffProduct` never throws — any failure (no
match, bad response, network error) resolves to `null`, and
`resolveIngredients` in `barcode-lookup/index.ts` falls through to USDA FDC
(below) for raw text only. Only if *both* have nothing does the ingredients
section come back empty.

**Cost:** Free, no cost tier.

---

## USDA FoodData Central

**What it's for:** **Fallback only**, used when Open Food Facts has no match
for a UPC. Returns raw ingredient text with no structured classification —
so a UPC resolved only by FDC gets keyword-based flagging
(`classifyByKeyword`), noticeably weaker than the Open Food Facts path above.

**Endpoint:** `GET https://api.nal.usda.gov/fdc/v1/foods/search?query=<upc>&dataType=Branded&pageSize=1`

**Auth:** `api_key` query param (`USDA_FDC_API_KEY` secret, free — signup at
api.data.gov).

**How the lookup actually works:** FDC's search endpoint is full-text search,
not a structured GTIN filter. Searching the raw UPC/EAN digits as the query
text reliably surfaces the right product — verified manually against 5 real
UPCs, all 5 returned exactly one result and it was the correct exact match —
but the server gives no guarantee. `fetchProductByUpc` re-checks the returned
`gtinUpc` against the input UPC before trusting the result. On a match it
also returns a name/brand fallback (FDC's `description`/`brandOwner`), used
the same way Open Food Facts' name/brand is — to power `barcode-lookup`'s
"partial hit" response when RapidAPI has no price match for the UPC.

**Caching:** Same 30-day `products.ingredients_*` cache as Open Food Facts —
`ingredients_source: 'fdc'` distinguishes a fallback-sourced row from an
`'off'` one, in case classification confidence ever needs to be surfaced.

**Fallback on failure:** `fetchProductByUpc` never throws — any failure
resolves to `null`, and `resolveIngredients` falls through to an empty
ingredients result. Price and OCR history are unaffected either way, since
ingredients are an enrichment, never a precondition for the primary lookup.

**Cost:** Free, no cost tier.

---

## Expo Push API

**What it's for:** Delivers the "price drop" push notification when
`price-match-check` finds a savings opportunity.

**Endpoint:** `POST https://exp.host/--/api/v2/push/send`

**Auth:** None — Expo's push service is authenticated by each device's push
token (obtained on-device via `expo-notifications`), not a server credential.

**Fallback on failure:** `sendExpoPushNotifications` never throws. Messages
are sent in batches of up to 100 (Expo's limit); each batch is wrapped in its
own try/catch, so one failed batch is logged and skipped rather than
aborting the rest. Push delivery is a side effect of `price-match-check`'s
real work (writing `price_alerts` rows) — a push failure must never roll
back or block that write, since the in-app Alerts screen is the source of
truth regardless of whether the push arrived.

**Cost:** Free.

---

## Brevo (email + SMS)

**What it's for:** Price-drop alerts outside the app:
- **Email, immediately** — `price-match-check` sends one email per user per run
  ("You could get $X back on N items" + a *View in Bulkmate* button) for drops
  that are new or deeper than last time. Stamped in `price_alerts.emailed_at`.
- **SMS, weekly** — `weekly-price-texts` sends a <=160-char digest on Fridays at
  3 PM America/Los_Angeles (pg_cron fires at 22:00 and 23:00 UTC; the function
  sends only in the hour that is 3 PM in LA). Stamped in `price_alerts.texted_at`.
- **SMS verification codes** — `phone-verification`, before texts can be enabled.

Auth emails (sign-up/reset codes) also go through Brevo, but via its **SMTP
relay configured in the Supabase dashboard**, not this client.

**Endpoints:** `POST https://api.brevo.com/v3/smtp/email`,
`POST https://api.brevo.com/v3/transactionalSMS/send`

**Auth:** `api-key` header — Edge Function secret `BREVO_API_KEY`. Optional
secrets: `BREVO_SENDER_EMAIL` (default `noreply@everyday-labs.org`, must be a
verified Brevo sender), `BREVO_SENDER_NAME` (default `Bulkmate`),
`BREVO_SMS_SENDER` (default `Bulkmate`; alphanumeric senders aren't allowed in
every country — the US needs a registered number).

**Rules that matter:**
- **SMS must stay GSM-7** (plain ASCII here): one emoji/curly quote/em dash
  switches to UCS-2 and drops the single-SMS limit from 160 to 70 chars.
- Brevo auto-switches any SMS containing a STOP/opt-out line to its
  `marketing` type. The weekly digest includes "Reply STOP to opt out"
  (US carriers expect it on recurring texts); verification codes don't.
- Texts only go to `sms_alerts_enabled` users with `phone_verified_at` set.
  The `guard_phone_verification` trigger stops clients from setting either
  without going through `phone-verification`.
- Every price email carries a signed one-click unsubscribe link
  (`email-unsubscribe`, `verify_jwt = false`, HMAC via `NOTIFY_LINK_SECRET`) and
  `List-Unsubscribe` / `List-Unsubscribe-Post` headers.
- Links point at `https://everyday-labs.org/alerts`, a universal link
  (apple-app-site-association on the website) that opens the app's `/alerts`
  screen, with a web fallback page.

**Fallback on failure:** `sendBrevoEmail` / `sendBrevoSms` never throw — a
missing key or Brevo error is logged and returns `false`. The alert row is
already written, the delivery stamp stays null, and the in-app Alerts screen
remains the source of truth.

**Cost:** Email free up to 300/day on the free plan. SMS needs purchased
credits (per-country pricing).

---

## PostHog

**What it's for:** Backend half of the app's single analytics/error-tracking
tool (PostHog — Sentry was removed 2026-08-06). Every Edge Function's
top-level `catch` reports the exception here, so a Vision OCR failure, an
unexpected `barcode-lookup`/`check-in`/`price-match-check` 500, etc. show up
in the same PostHog project as the mobile app's crashes and events — one
place to look, not split across Supabase function logs and a separate error
tool.

**Endpoint:** `POST <POSTHOG_HOST>/capture/`

**Auth:** `api_key` in the request body (`POSTHOG_PROJECT_TOKEN` secret).

**Why not the `posthog-node` SDK:** that SDK buffers events in memory and
flushes on an interval or on `shutdown()` — a bad fit for a Deno Edge
Function, whose isolate can be frozen the instant a response is returned,
silently dropping anything still queued. `_shared/posthog.ts` does one
`await fetch(...)` per event instead, so nothing is lost, at the cost of one
extra request per captured event/exception.

**Fallback on failure:** `capturePostHogEvent`/`capturePostHogException`
never throw — if `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST` aren't set, or the
request fails, capture is a silent no-op and the function's real response
(success or its own error) is completely unaffected.

**Secrets:** `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` — same values as
`costco-mobile/.env`, but must be set separately as Edge Function secrets
via the Supabase dashboard (not yet confirmed set, see `CLAUDE.md`).

**Cost:** Free tier at current volume.

---

## Adding a new external API

Follow the existing pattern:
1. One file per API under `supabase/functions/_shared/`, named after the API
   (`rapidApi.ts`, `usdaFdc.ts`, etc.).
2. The client function itself should **never throw** unless the API is a true
   hard dependency with no reasonable fallback (Vision is currently the only
   one). Catch network-level errors internally and return `null`/empty on any
   failure — let the caller decide how to degrade.
3. Document it in the table and a section above, following the same shape:
   what it's for, endpoint, auth, fallback behavior, cost.
4. Note the required secret name in `CLAUDE.md`'s "Not done" list until it's
   confirmed set on the deployed functions.
