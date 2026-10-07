# External APIs & Services

Every third-party service Bulkmate depends on: what it's used for, which key
it needs, what it costs, its limits/SLA, and what happens when it fails.
The first half is the **register** (accounts, keys, costs, limits — keep it
current whenever a key, plan or service changes); the second half is the
per-API detail for the seven runtime clients in `supabase/functions/_shared/`
(one file per API).

**Never put secret values in this file** — the repo is public. Record the
secret's *name* and where it lives; the values live in the provider
dashboards, `supabase secrets`, EAS environment variables, and a password
manager.

*Prices and limits below were checked against the providers' public pages on
2026-10-07. Re-check before relying on them — providers change plans.*

## Which service is used for what

| Service | Used for | Called from | Auth | Cost |
|---|---|---|---|---|
| Google Cloud Vision | Receipt OCR (photo → text) | `ingest-receipt` (`_shared/googleVision.ts`) | API key | **Paid** per image |
| RapidAPI — Costco Live Data | Live Costco price, name, image, rating | `barcode-lookup`, `price-match-check` (`_shared/rapidApi.ts`) | API key (header) | **Paid** subscription |
| Open Food Facts | Ingredients, NOVA, Nutri-Score, additives (primary) | `barcode-lookup` (`_shared/openFoodFacts.ts`) | None (User-Agent) | Free |
| USDA FoodData Central | Ingredient text (fallback) | `barcode-lookup` (`_shared/usdaFdc.ts`) | API key (query param) | Free |
| Expo Push API | Price-drop push notifications | `price-match-check` (`_shared/expoPush.ts`) | Device push token | Free |
| Brevo API | Price-drop emails; SMS digest + phone codes (⏸ paused) | `price-match-check`, `weekly-price-texts`, `phone-verification` (`_shared/brevo.ts`) | API key (header) | Free ≤300 emails/day; SMS paid |
| Brevo SMTP relay | Auth emails (sign-up / reset codes) | Supabase Auth (dashboard config) | SMTP login + key | Shares the 300/day |
| PostHog | Analytics, session replay, error tracking | Mobile app + all 8 Edge Functions (`_shared/posthog.ts`) | Project token | Free tier |
| Supabase | Postgres, Auth, Storage (receipt images), Edge Functions, pg_cron | Everything | Anon key (app), service-role key (functions) | Plan to confirm (see below) |
| Google Sign-In | "Sign in with Google" | Mobile (`lib/googleSignIn.ts`) → Supabase Auth | OAuth client IDs + secret | Free |
| Sign in with Apple | "Sign in with Apple" | Mobile → Supabase Auth | Services ID + client-secret JWT | Included in Apple Developer |
| Google Places API | One-off seeding of the 723 warehouses + rarity | `costco-backend/scripts/seed-warehouses-from-google-places.mjs` (run locally) | API key | **Paid** above free cap |
| Expo / EAS | Cloud builds, TestFlight submits, OTA updates, iOS push credentials | `eas` CLI | Expo account | Free plan |
| GitHub Pages | everyday-labs.org website, AASA universal-link file, feedback form | Browser | — | Free |
| Cloudflare | DNS for everyday-labs.org; `hello@` email forwarding | — | Cloudflare account | Free |
| Domain `everyday-labs.org` | Website, email sender, universal links | — | Registrar account | **Paid** yearly |
| Apple Developer Program | Signing, TestFlight/App Store, Sign in with Apple, push (APNs) | — | Apple ID, team `XX3T25NCVV` | **Paid** $99/yr |

## Paid accounts — what's actually costing money

| Account | What you pay for | Price (2026-10-07) | Started / renews | Evidence | To confirm |
|---|---|---|---|---|---|
| **Google Cloud** (project "Bulkmate") | Vision OCR; Places API when seeding | Vision `DOCUMENT_TEXT_DETECTION`: first 1,000 images/month free, then $1.50 per 1,000 (≈ $0.0015/receipt). Places Text Search Pro: 5,000 calls/month free, then $32 per 1,000 | Billing account upgraded from free trial to paid **2026-06-03** | "You have upgraded to a paid Google Cloud account" email, 2026-06-03 | Set a **budget alert** (Billing → Budgets) — none is recorded; restrict both API keys to their one API |
| **RapidAPI** (Costco Live Data) | Pricing lookups | Depends on the plan subscribed to — not recorded anywhere in the repo | Unknown | No receipt found in the developer's Gmail | Plan name, monthly quota, overage price (RapidAPI → My Apps → Billing). Overage on RapidAPI plans is usually billed automatically |
| **Apple Developer Program** | Distribution, Sign in with Apple, push | $99/year | Enrolled + PLA accepted **2026-08-11** → renews ~2026-08-11 each year | `CLAUDE.md` → Build Status | Auto-renew on; lapsing pulls the app from the App Store |
| **Domain `everyday-labs.org`** | Website, `noreply@`/`hello@` email, universal links | Cloudflare Registrar at-cost yearly .org price | Bought **2026-10-06**, registry expiry **2027-10-06** | WHOIS (registrar Cloudflare, Inc.) | Confirm auto-renew is on (Cloudflare → Domain Registration → Manage). Losing the domain breaks email, privacy URL and universal links at once |
| **Supabase** | Whole backend | Free $0, Pro $25/month | — | — | **Which plan?** On Free, a project with no activity for 7 days is paused (app goes dark until restored by hand), Edge Functions stop at 150s, and DB/Storage cap at 500 MB / 1 GB. Pro is the safe choice once real users exist |
| **Brevo** | Email (free); SMS credits only if texts are re-enabled | Free: 300 emails/day, Brevo branding. SMS: prepaid credits per country | — | — | Stay on free until volume approaches 300/day |
| **Google Play Console** | Android publishing | $25 one-time | Not paid yet | — | Only needed if Android ships |
| Free: PostHog, Expo/EAS, Open Food Facts, USDA FDC, Expo Push, GitHub Pages, Cloudflare | — | $0 | — | — | Watch the free caps in the limits table below |

## API keys & secrets register

Where every credential lives. "Public" means it ships inside the app or website
by design and is safe to expose; everything else is secret.

| Name | Service / account | Lives in | Public? | Used by | Rotation / expiry notes |
|---|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project | `costco-mobile/.env`, EAS env vars; also hard-coded in website `bulkmate/feedback.html` | Public | Mobile app, feedback form | — |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase project | Same as above | Public (RLS protects data) | Mobile app, feedback form | Rotating it needs an app release *and* a website edit |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` | Supabase project | Edge Function secrets (auto-managed) | **Secret** — bypasses RLS | All Edge Functions | Never ship to the app or website |
| `GOOGLE_CLOUD_VISION_API_KEY` | Google Cloud project "Bulkmate" (paid) | Edge Function secret | **Secret** | `ingest-receipt` | Restrict to Cloud Vision API only |
| `RAPIDAPI_KEY` | RapidAPI account | Edge Function secret | **Secret** | `barcode-lookup`, `price-match-check` | A leaked key bills your RapidAPI plan |
| `USDA_FDC_API_KEY` | api.data.gov | Edge Function secret | Secret (free) | `barcode-lookup` | Registered under the developer's details (`NAMING_TODO.md` §5) |
| `BREVO_API_KEY` | Brevo account | Edge Function secret | **Secret** | Email/SMS functions | — |
| `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `BREVO_SMS_SENDER` | Brevo | Edge Function secrets (optional) | Not secret | Brevo client | Defaults in `_shared/brevo.ts` |
| `ALERT_EMAIL_DAILY_CAP` | — (tuning) | Edge Function secret (optional) | Not secret | `price-match-check` | Default 200 price-drop emails per UTC day; raise it if Brevo is upgraded |
| `RAPIDAPI_MAX_CALLS_PER_RUN` | — (tuning) | Edge Function secret (optional) | Not secret | `price-match-check` | Default 300; set to about (monthly RapidAPI quota − expected barcode scans) ÷ 30 |
| Brevo SMTP login + SMTP key | Brevo account | Supabase dashboard → Auth → SMTP | **Secret** | Auth emails | Separate from `BREVO_API_KEY` |
| `NOTIFY_LINK_SECRET` | Self-generated | Edge Function secret | **Secret** | Signs email unsubscribe links (`_shared/notifyLinks.ts`) | Changing it breaks every unsubscribe link already sent |
| `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` | PostHog project | `costco-mobile/.env`, EAS env vars, Edge Function secrets | Public (write-only) | App + functions | — |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google Cloud "Bulkmate" OAuth clients | `costco-mobile/.env`, EAS env vars | Public | Google sign-in | — |
| Google OAuth Web client **secret** | Google Cloud "Bulkmate" | Supabase dashboard → Auth → Google | **Secret** | Supabase Auth | — |
| Apple Sign-in client-secret JWT | Apple Developer (client ID `com.twonk0609.bulkmate`) | Supabase dashboard → Auth → Apple | **Secret** | Supabase Auth | **Expires 2027-02-10** (6-month max; calendar reminder set for 2027-01-27). Re-mint with `costco-backend/scripts/generate-apple-client-secret.mjs` |
| Apple `.p8` signing key (+ Key ID `B4MB9C5436`) | Apple Developer | `~/.config/bulkmate/` on the developer's Mac (mode 600, not iCloud-synced) + a macOS Keychain backup item; never in the repo (`*.p8` gitignored) | **Secret** | Mints the JWT above | Downloadable only once — moved off the synced Desktop 2026-10-07 |
| APNs push key / iOS certificates | Apple Developer | Managed by EAS credentials | **Secret** | iOS push via Expo | Created by `eas credentials` / first EAS build |
| `GOOGLE_PLACES_API_KEY` | Google Cloud "Bulkmate" (paid) | Developer's shell env only, when seeding | **Secret** | Seed script | Restrict to Places API; disable between seeding runs |
| Supabase CLI access token | Supabase account | `~/.supabase` on the dev machine | **Secret** | `supabase db push`, `functions deploy` | — |

## Limits, SLAs, bottlenecks & drawbacks

| Service | SLA | Limits that matter | Bottlenecks & drawbacks |
|---|---|---|---|
| **Google Cloud Vision** | ≥ 99.9% monthly uptime (published Google SLA) | 1,000 free images/month, then billed per image | **Hard dependency** — when it's down or the key is wrong, no receipt can be scanned (the only client allowed to throw). Cost grows 1:1 with scans; nothing to cache. 30s request timeout → a clean "retry" error. `ingest-receipt` only runs for the signed-in owner of the uploaded image, so the anon key can't spend Vision calls. |
| **RapidAPI — Costco Live Data** | **None** — a third-party marketplace listing, not Costco | Plan quota unknown (see above) | Unofficial data source that can change, rate-limit or disappear without notice. Doesn't match raw UPC/EAN barcodes (most real scans). Main ongoing cost. **Mitigated:** 72h cache; 8s timeout; the sweep prices each SKU once, 4 at a time, stops starting new SKUs after 90s, and makes at most `RAPIDAPI_MAX_CALLS_PER_RUN` (default 300) API calls — SKUs past either limit fall back to the OCR ledger or wait for the next run. `barcode-lookup` requires a signed-in user and `price-match-check` the service role, so the anon key can't spend calls. **Still open:** set the per-run cap from the real plan quota. |
| **Open Food Facts** | **None** — volunteer-run non-profit | 15 product reads/min per IP; search 10/min; IP bans for abuse | All calls come from Supabase's shared egress IPs, so the per-IP limit is shared with other tenants → expect occasional 429s (graceful: falls back to USDA). Crowd-sourced data can be wrong. 8s timeout. **ODbL licence requires attribution** — credited under the ingredients card on the product screen (linked to openfoodfacts.org). |
| **USDA FoodData Central** | None (US government service) | 1,000 requests/hour per key; a block lasts 1 hour | Full-text search, not a barcode lookup — every hit is re-checked against the UPC. US-branded foods only; raw text only, so weaker classification. |
| **Expo Push** | **None** — Expo publishes no SLA; APNs/FCM have occasional outages too | 100 messages per request (batched); no daily cap | Push is best-effort; the in-app Alerts screen is the source of truth. Push receipts aren't checked, so dead tokens are never cleaned up. Needs a dev/Release build — not Expo Go. |
| **Brevo** | No SLA on the free plan | **300 emails/day total** (auth codes + price-drop emails share it); Brevo branding on free | The daily cap is the first hard ceiling. **Mitigated:** price-drop emails stop at `ALERT_EMAIL_DAILY_CAP` (default 200) per UTC day, leaving ~100 for sign-up/reset codes; anything past the cap — or any failed send — keeps `emailed_at` null and goes out on the next run. 10s timeout. A sign-up spike of 100+/day can still exhaust it — upgrade Brevo before then. US SMS needs a registered number + paid credits (why SMS is paused). |
| **PostHog** | No SLA on the free tier | Free per month: 1M events, 5K session recordings, 100K exceptions | Session replay is the cap you'll hit first. Set billing limits if a card is ever added. Backend delivery has never been confirmed in the dashboard. |
| **Supabase** | No SLA on Free/Pro | Free: 500 MB DB, 1 GB Storage, 500K function calls, 5 GB egress, 2s CPU per request, **150s wall clock** (400s on paid); paused after 7 days idle | Single point of failure for everything. Receipt images fill the 1 GB Storage cap first. A Free-plan pause also stops the daily price-match cron. |
| **Google Places** | Google Maps Platform SLA | Text Search Pro: 5,000 free calls/month, then $32 per 1,000 | Only used when re-seeding. Ratings drift, so rarity tiers go stale until the script is re-run. Google's terms restrict long-term caching of Places content — worth reviewing for the stored `google_rating` columns. |
| **Expo / EAS** | None on the free plan | 15 iOS + 15 Android builds/month; OTA updates to 1,000 MAU | Build queue waits on the free tier. |
| **Apple** | — | — | Sign-in client secret expires every 6 months (next **2027-02-10**). Hide-My-Email users only receive mail from registered sender domains. |
| **Domain / Cloudflare / GitHub Pages** | None (free tiers) | GitHub Pages: soft 100 GB/month bandwidth | One expired domain breaks website, email and universal links together. |

## Who may call each Edge Function

The gateway's default `verify_jwt` only proves a token was signed by this
project — the public anon key passes it. Functions that spend money or act for
a user check the caller themselves (`_shared/auth.ts`):

| Function | Allowed caller | Why |
|---|---|---|
| `price-match-check` | Service role only (pg_cron sweep, `ingest-receipt`) | Spends RapidAPI calls and the Brevo email quota |
| `weekly-price-texts` | Service role only (pg_cron) | Sends paid SMS |
| `ingest-receipt` | Signed-in user; image must be under `<their id>/` | Spends Vision calls; writes into the caller's account |
| `barcode-lookup` | Signed-in user | Spends RapidAPI calls |
| `check-in`, `delete-account`, `phone-verification` | Signed-in user | Act on the caller's account |
| `email-unsubscribe` | Anyone with a signed link (`verify_jwt = false`) | Opened from an email |

Every outbound API call has a timeout (5-30s, set per client in `_shared/`), so
one slow provider can't hold a function until the 150s gateway limit.

## Services not called at runtime

These don't appear in `_shared/` but are part of what keeps the app running.

- **Supabase** — the backend itself. Auth emails go through the Brevo SMTP relay
  set in the dashboard. `pg_cron` runs `daily-price-match-sweep` (08:00 UTC)
  through `pg_net`; `weekly-price-texts` is unscheduled while SMS is paused.
- **Google Sign-In / Sign in with Apple** — the native SDKs return an ID token
  that `supabase.auth.signInWithIdToken` verifies; provider secrets live in the
  Supabase dashboard (see the key register).
- **Google Places API** — only `scripts/seed-warehouses-from-google-places.mjs`,
  run by hand: `GOOGLE_PLACES_API_KEY=… node costco-backend/scripts/seed-warehouses-from-google-places.mjs`
  (`REGION_FILTER` limits the run). Output is a SQL migration; the app never
  calls Places.
- **Expo / EAS** — builds and push credentials; project `costco-app`, owner
  `twonk0609s-team` (never rename — see `NAMING_TODO.md`).
- **Website** (`everyday-labs/everyday-labs.github.io`) — the feedback form
  posts straight to Supabase REST with the anon key (`feature_requests` is
  insert-only).

## Runtime clients (`supabase/functions/_shared/`)

| API | Client file | Called from | Auth | Cost |
|---|---|---|---|---|
| Google Cloud Vision | `_shared/googleVision.ts` | `ingest-receipt` | API key | Paid, per-image |
| RapidAPI — Costco Live Data | `_shared/rapidApi.ts` | `barcode-lookup`, `price-match-check` | API key (header) | Paid, per-request (RapidAPI plan) |
| Open Food Facts | `_shared/openFoodFacts.ts` | `barcode-lookup` | None (User-Agent required) | Free |
| USDA FoodData Central | `_shared/usdaFdc.ts` | `barcode-lookup` (fallback only) | API key (query param) | Free |
| Expo Push API | `_shared/expoPush.ts` | `price-match-check` | None (device push token) | Free |
| Brevo (email + SMS) | `_shared/brevo.ts` | `price-match-check`, `weekly-price-texts`, `phone-verification` | API key (header) | Email free up to 300/day; SMS paid credits |
| PostHog | `_shared/posthog.ts` | All 8 functions (top-level catch) | Project token | Free tier |

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

> **v1 ships email only (decided 2026-10-06).** The SMS path below is built but paused: the
> `weekly-price-texts` cron job is unscheduled, the `weekly-price-texts` and `phone-verification`
> functions are not deployed, and the app hides the toggle behind `SMS_ALERTS_ENABLED` in
> `costco-mobile/lib/features.ts`. US texting needs a registered sender number and paid credits.
> Re-enabling steps are in `migrations/20261007000002_pause_sms_for_v1.sql`.

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
