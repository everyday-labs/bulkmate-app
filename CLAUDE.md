# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A gamified Costco membership companion app (iOS/Android, mobile-only for v1) that turns warehouse visits into a "treasure hunt" while providing receipt OCR tracking, sliding-window price-match alerts, and a barcode-based product lookup. Open-source solo side project, not affiliated with Costco.

**Publisher (adopted 2026-10-06):** the developer's company/studio name is **Everyday Labs**. It's the copyright holder (`LICENSE`, iOS `NSHumanReadableCopyright` in `app.json`, `package.json` `author`), the responsible party in `costco-mobile/docs/PRIVACY.md`, the contracting party in the register screen's terms line, and appears in the Profile → About card, the auth email templates (`costco-backend/supabase/templates/`), and the Open Food Facts User-Agent. The app's own name stays **Bulkmate**. The "Tinker" persona and all first-person copy were **removed from public-facing text on 2026-10-06** (website, Profile → About card, README) at the user's request — write public copy in third person as Everyday Labs. Website: `everyday-labs.org` (GitHub Pages, repo `everyday-labs/everyday-labs.github.io`, local clone `~/Desktop/everyday-labs.github.io`); the site's `bulkmate/privacy.md` is a copy of `costco-mobile/docs/PRIVACY.md` and must be re-copied when the policy changes. Identifiers that embed the old account name (`com.twonk0609.bulkmate`, EAS owner `twonk0609s-team`) deliberately did **not** change — renaming a bundle ID creates a different App Store app and breaks Apple/Google sign-in config. The **App Store seller name** comes from the Apple Developer enrollment, not from code: an individual enrollment shows the person's legal name; showing "Everyday Labs" requires an organization enrollment (legal entity + D-U-N-S number).

**App identity (renamed 2026-08-12):** display name **Bulkmate**, bundle ID `com.twonk0609.bulkmate`, scheme `bulkmate`. Renamed off the Costco name before beta distribution — an app named/branded as Costco implies an affiliation that doesn't exist, which is an App Review rejection trigger and a trademark exposure. Factual references to Costco in copy ("Scan your first Costco receipt") are deliberately kept: the app really does read Costco receipts, and that's nominative use. Only strings branding *the app itself* were changed. `expo.slug` stays `costco-app` because it must match the existing EAS project.

Repo layout: **one Git repo rooted at `costco-app/`**, containing three directories. (Verified 2026-08-11 — `git rev-parse --show-toplevel` from `costco-mobile/` and `costco-backend/` both return the `costco-app/` root, and both share the same `origin`. Older notes describing these as "two independent repos" are stale.) Note the folder was renamed from `Costco app` to `costco-app` on 2026-08-11: React Native's iOS build scripts don't quote paths, so a space broke the build.

```
Costco app/                  ← this directory (top-level docs, not itself the app code)
├── costco-mobile/           ← Expo + React Native app
├── costco-backend/          ← Supabase migrations + Edge Functions
└── supabase/                ← local Supabase CLI link metadata only (not app code)
```

There is **no monorepo and no NestJS/AWS Lambda backend** — that was the original plan and was dropped on 2026-05-29 in favor of Supabase Edge Functions, because solo-dev overhead wasn't justified. If you see references to a TypeScript monorepo, Next.js web dashboard, or NestJS/Lambda elsewhere, they describe the abandoned plan, not the current app.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile (iOS/Android) | React Native + Expo SDK 54 (Expo Router, file-based navigation) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Database | PostgreSQL via Supabase, no ORM (raw SQL migrations + `@supabase/supabase-js`) |
| Auth | Supabase Auth — email/password (8-digit emailed confirmation + reset codes), Sign in with Apple, Google Sign-In (`@react-native-google-signin/google-signin`, native ID token → `signInWithIdToken`); RLS enforces per-user data access |
| Push notifications | Expo Push API |
| Email | Brevo — Supabase Auth sends codes through Brevo's SMTP relay; `price-match-check` sends price-drop emails through Brevo's API; public contact `hello@everyday-labs.org` (Cloudflare Email Routing → personal Gmail; the Gmail address is deliberately kept off the app, site and policy — only Google's consent-screen support email still needs it); sender `noreply@everyday-labs.org` (domain authenticated with SPF + DKIM + DMARC `p=none`; registered for Apple private relay) |
| Website | `everyday-labs.org` — GitHub Pages, repo `everyday-labs/everyday-labs.github.io` (local `~/Desktop/everyday-labs.github.io`): Bulkmate product pages, privacy policy, support, feedback form, universal-link file |
| OCR | Google Cloud Vision (`DOCUMENT_TEXT_DETECTION`), called server-side from the `ingest-receipt` function |
| Pricing/barcode data | RapidAPI `costco-live-data.p.rapidapi.com` |
| Ingredient data | Open Food Facts (free, primary — real NOVA/Nutri-Score/additive data), USDA FoodData Central (free, fallback — raw text only), both called server-side from `barcode-lookup` |
| Analytics, error tracking & session replay | PostHog (`posthog-react-native` on mobile, direct HTTP capture calls from Edge Functions) — see "PostHog / Observability" below |
| Offline queue | `expo-file-system/next` + AsyncStorage + NetInfo listener |
| Mobile testing | Expo Go (QR code scan) |
| Web dashboard | Not built — deferred to v2+ |

See `costco-backend/EXTERNAL_APIS.md` for every third-party API call in the app — endpoint, auth, caching policy, and (critically) what happens when each one fails. Every external client lives in `costco-backend/supabase/functions/_shared/`, one file per API, and none of them (except Vision, intentionally) is allowed to throw — a failed enrichment call must degrade gracefully, never take down the whole request. Every outbound `fetch` carries an `AbortSignal.timeout`. **Any function that spends money or acts for a user must check its caller with `_shared/auth.ts`** — the gateway's `verify_jwt` accepts the public anon key.

**Expo SDK is pinned at 54** (`costco-mobile/package.json`) to match the installed Expo Go client. Do not upgrade to SDK 56 without first confirming Expo Go on the test device supports it — `costco-mobile/AGENTS.md` currently points at v56 docs, which is stale/wrong; treat the pinned `package.json` version as the source of truth, not that file.

## Commands

```bash
# Mobile (costco-mobile/)
npm install --legacy-peer-deps   # required — peer dep conflicts otherwise
npx expo start --clear           # dev server + QR code
npx expo run:ios                 # run on iOS simulator
npx expo run:ios --device <udid> # build + install on a physical iPhone (needs paid Apple team, see Build Status)
npx expo run:android             # run on Android emulator
npx tsc --noEmit                 # typecheck (strict mode)
npm run lint                     # ESLint (eslint-config-expo), zero warnings
npm test                         # Jest + RN Testing Library — __tests__/screens, lib/__tests__, hooks/__tests__
npm run test:coverage            # + coverage; fails below jest.coverageThreshold (80/80/75/65)
npm run check:contrast           # WCAG contrast of constants/colors.ts — must print "All pairings pass"
npm run build:web && npm run test:visual   # Playwright visual regression (e2e/)
../scripts/check-all.sh          # everything CI runs (also the pre-push hook)

# Edge Functions (costco-backend/supabase/functions/) — Deno 2 (`npx deno …` works without installing)
deno check .                     # typecheck every function + test
deno lint
deno test --allow-env --allow-read   # *.test.ts next to the code they cover
../../../scripts/deno-coverage.sh    # tests + coverage gate (≥90% lines over every source file)

# Backend (costco-backend/supabase/)
supabase db push                 # apply migrations to linked remote project
supabase functions deploy <name> # deploy a single Edge Function
```

**Quality pipeline (2026-10-07).** CI (`.github/workflows/ci.yml`) runs on every PR and push to `main`: *Lint & typecheck* (Prettier on all tracked files, ESLint, tsc, contrast, deno check/lint), *Mobile tests* (Jest + coverage threshold), *Edge Function tests* (`scripts/deno-coverage.sh`, ≥90% lines), *Visual regression* (Playwright in the pinned `mcr.microsoft.com/playwright` image), *Secret scan* (gitleaks over every commit, `.gitleaks.toml`; `.gitleaksignore` pins already-revoked findings by fingerprint — empty since the 2026-10-08 history rewrite), *Workflow & shell lint* (actionlint, zizmor, shellcheck), *Dependency review & audit* (blocks new high/critical/GPL deps; `npm audit` is report-only because the existing findings are in Expo SDK 54 tooling), and one aggregate **CI passed** status. Separate workflows: **CodeQL** (`codeql.yml`, required on `main`) and **OpenSSF Scorecard** (`scorecard.yml`, weekly). Tools downloaded in CI are pinned by version + SHA-256; every checkout uses `persist-credentials: false`. Husky hooks live in `costco-mobile/.husky` (root `.lintstagedrc.mjs`): pre-commit = lint-staged on staged files + related tests; pre-push = `scripts/check-all.sh`. **The repo is public (`everyday-labs/bulkmate-app`, since 2026-10-07) and `main` is protected:** every change goes through a pull request, the **CI passed** check must be green with the branch up to date, admins included; no force-pushes or deletion. GitHub secret scanning + push protection are on, so a push containing a credential is rejected. Never commit `.claude/settings.local.json` (gitignored) — it once held a Google Places API key via a saved permission rule; that key was deleted and the alert resolved. Pass keys to scripts through the shell or a gitignored `.env`, e.g. `GOOGLE_PLACES_API_KEY=… node costco-backend/scripts/seed-warehouses-from-google-places.mjs`; the Places key is only used by that script (receipt OCR uses the separate `GOOGLE_CLOUD_VISION_API_KEY` Supabase secret). Security fixes from PR #30 (uniform SMS codes, generic 500 errors) are deployed: `check-in` v27 and `delete-account` v8 (2026-10-08, smoke-tested live); `phone-verification` stays undeployed while SMS is paused. **There is deliberately no `package.json` at the repo root** — Deno (and Supabase's bundler) would then switch `costco-backend` to npm resolution and fail; repo tooling lives in `costco-mobile/package.json` and Prettier reads the root `.prettierrc.json`. Tests: mobile screens in `costco-mobile/__tests__/screens/` (never under `app/` — Expo Router would treat them as routes), using `test-utils/` (in-memory Supabase client, expo-router mock, `renderWithProviders`) and native-module mocks in `jest.setup.ts`. **Each Edge Function's logic is in `handler.ts` (exported `handler`); `index.ts` only calls `serve(handler)`** so tests can import it — keep new functions to that shape. Handler tests use `_testing/fakeSupabase.ts` (stubbed fetch for PostgREST/auth/storage/functions and external APIs); `coverage.test.ts` imports every module so untested files count as 0%. Visual baselines are Linux-only (`*-linux.png` committed; local `*-darwin.png` gitignored); a new or intentionally changed screen → CI uploads `visual-baselines` → commit them. **When a real receipt breaks the parser, add its shape to `ingest-receipt/parser.test.ts` first, then fix.** Supabase client params are typed as `SupabaseClient` imported from supabase-js — not `ReturnType<typeof createClient>`, which resolves table rows to `never` with the unpinned `@2` import.

**Supabase CLI works** (verified 2026-08-11, CLI v2.111.0, project linked and authenticated) — `supabase functions deploy <name>` works directly and is the preferred path. This was broken earlier in the project's history (token format issue) and older notes may still say deploys must be done by hand via the dashboard; that's stale. Docker isn't running locally, so deploys emit a `WARNING: Docker is not running` line — harmless, the bundle still uploads and deploys fine.

`eas.json` exists (added 2026-08-12) with `development` / `preview` / `production` profiles and `appVersionSource: remote` so TestFlight build numbers auto-increment. **The env vars are not in it on purpose**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` are read from `process.env` (the latter two via `app.config.js` → `extra`), and `.env` is gitignored, so they must be registered as EAS environment variables before the first cloud build — otherwise the build silently ships with no Supabase URL.

## Architecture

```
costco-mobile (Expo Router)  ──HTTPS──►  costco-backend (Supabase Edge Functions, Deno)
      │                                          │
      │ direct read/write (RLS-scoped)           │ service-role writes
      ▼                                          ▼
                    Supabase PostgreSQL
```

Most reads (receipts, receipt_items, badges, profile) go straight from the mobile app to Supabase via `@supabase/supabase-js`, protected by Row Level Security. Writes that need a trusted external API call or server-side secret go through an Edge Function:

- `ingest-receipt` — receipt image → Google Cloud Vision OCR → `parser.ts` → validated `receipt_items` insert. The user comes from the caller's JWT (never the body), and the image path must be under `<that user id>/`.
- `price-match-check` — compares `receipt_items.unit_price - discount_amount` against `products.current_price` (fetched/cached from RapidAPI), writes `price_alerts`, sends push + email. **Service-role callers only.** Prices each SKU once with bounded concurrency inside a time budget, caps RapidAPI calls (`RAPIDAPI_MAX_CALLS_PER_RUN`) and price-drop emails per UTC day (`ALERT_EMAIL_DAILY_CAP`), and delivers any alert whose channel stamp is still null — so whatever a run had to defer goes out on the next one.
- `barcode-lookup` — signed-in users only; SKU → `product_lookups` cache, else RapidAPI live fetch; also resolves a good/watch/avoid-classified ingredient list via Open Food Facts (primary — real NOVA/Nutri-Score/additive data) falling back to USDA FoodData Central (raw text only) (independent 30-day cache, degrades to no ingredients card on failure — never fails the price lookup)
- `delete-account` — permanently deletes the caller's account (App Review Guideline 5.1.1(v) requires in-app account deletion for any app with account creation). The account is always taken from the verified JWT — there is deliberately no `user_id` parameter, since accepting one would let any signed-in user delete anyone's account. Every user table cascades from `auth.users`, so `auth.admin.deleteUser` clears the DB by itself; **Storage receipt images are not foreign-keyed and must be removed explicitly, before the user row goes away**. A failed image cleanup is logged, not fatal.
- `check-in` — two entry paths, both ending in the same shared `_shared/checkInRewards.ts` `awardCheckIn()` (star + `fan_tier` recalculation + badge awarding via `trigger_key`):
  - `{ latitude, longitude }` — GPS check-in, Haversine 50m validation against the nearest warehouse
  - `{ receipt_id, warehouse_id }` — **receipt-attested** check-in, used when the parser couldn't resolve a warehouse and the user picked one by hand on `receipt-success.tsx`. No GPS gate (the receipt is its own proof of presence), but the receipt must belong to the caller and must not already be linked. Links the receipt and dates the check-in to `receipts.transaction_date`.

**Receipt images are uploaded to Storage *before* the receipt row exists** (`lib/receiptUpload.ts`), so every path that fails to produce a row owning that file must delete it again — a failed/duplicate ingest otherwise orphans the image in Storage forever, invisible in the app and untouched by "delete this receipt". This leaked 16 images before it was fixed on 2026-08-12. The duplicate case is the non-obvious one: `ingest-receipt` returns the *existing* receipt's id, so the just-uploaded file is referenced by nothing. Orphans matter because a receipt photo carries the membership number.

The mobile app handles two on-device hardware concerns before ever hitting the backend:
- **Camera capture**: receipt/barcode images captured via `expo-camera`; local files read with `File(uri).bytes()` from `expo-file-system/next` (never `fetch(file://...)` or `Blob` — both are broken on React Native)
- **Foreground geo check**: `expo-location` foreground permission only (no background geofencing in v1) — the 50m Haversine threshold is enforced server-side in the `check-in` function, not trusted from the client

## Core Data Model (Supabase Postgres, raw SQL migrations in `costco-backend/supabase/migrations/`)

Ten tables:

- `profiles` (extends `auth.users`) → `receipts` (1:M) → `receipt_items` (1:M) → `products` (M:1)
- `receipts` → `warehouses` (M:1)
- `profiles` → `user_badges` (1:M) → `badges` (M:1) + `warehouses` (M:1)
- `profiles` → `check_ins` (1:M) → `warehouses` (M:1)
- `receipt_items` → `price_alerts` (1:1-ish, per item per alert)
- `products` → `product_lookups` (barcode-lookup cache/audit)

Key enums:
- `fan_tier`: `KirklandCadet | WholesaleWanderer | BulkBuyer | GoldStarGuru | ExecutiveExplorer`
- `warehouse_tier`: `Common | Rare | Legendary`

`fan_tier` advances automatically in the `check-in` Edge Function when `profiles.total_stars` crosses visit thresholds (1, 3, 6, 11, 21). A trigger auto-creates a `profiles` row on `auth.users` signup.

## Functional Requirements (status)

**FR-100 — Sliding Window Price Match** ✅ built. `price-match-check` Edge Function: triggered inline after receipt upload, plus a daily `pg_cron` 8am sweep of `receipt_items` where `transaction_date > NOW() - 30 days`. Compares `products.current_price` against `unit_price - discount_amount` (net paid price, not gross). Writes `price_alerts` + sends an Expo push notification.

**Email + SMS alerts (added 2026-10-06, via Brevo — see `costco-backend/EXTERNAL_APIS.md`). v1 ships EMAIL ONLY: the SMS half described below is built but paused (cron unscheduled, its two functions undeployed, UI behind `SMS_ALERTS_ENABLED=false` in `lib/features.ts`).** price-drop **emails go out immediately** from `price-match-check` (one per user per run, total savings only + a "View in Bulkmate" button, on by default with a signed one-click unsubscribe via `email-unsubscribe`); **texts are a weekly digest, Friday 3 PM US Pacific** (`weekly-price-texts`, pg_cron `weekly-price-texts` at `0 22,23 * * 5` UTC, sends only when it's 3 PM in LA; service-role callers only), opt-in only, after the number is verified by SMS code (`phone-verification`, `app/verify-phone.tsx`). Toggles live in Profile → Preferences. Links use the universal link `https://everyday-labs.org/alerts` (AASA on the website repo + `associatedDomains` in `app.json`). Same change fixed a real bug: every daily sweep re-upserted alerts with `notified_at: null`, so the same drop re-pushed daily — now only new or deeper drops notify (and a deeper drop un-dismisses the alert). Secrets: `BREVO_API_KEY` (user sets it), `NOTIFY_LINK_SECRET`.

**FR-200 — Receipt OCR Ingestion** ✅ built. Camera capture → on-device read via `expo-file-system/next` → upload to Supabase Storage → `ingest-receipt` Edge Function (Google Cloud Vision → two-pass-zip parser, see `costco-backend/PARSER_DECISIONS.md` for the full parsing decision log) → validated insert. Offline queue via AsyncStorage + NetInfo, drains on reconnect.

**FR-300 — Geo-Fenced Check-In & Badge Engine** ✅ built. `check-in` Edge Function: GPS coords + warehouse token → Haversine validation within 50m → insert `check_ins`, recalculate `total_stars` + `fan_tier`, award badges by `trigger_key`, return payload for the client's unlock animation.

Scanning a receipt also earns a check-in (added 2026-08-12) — a receipt is proof the user was physically at the warehouse. `ingest-receipt` calls the same `awardCheckIn()` after resolving the warehouse, dated to `parsed.transactionDate` rather than today (receipts are often uploaded days after the trip). The `check_ins_user_warehouse_day` unique index makes a repeat — a second receipt from the same trip, or a GPS check-in already logged that day — a **silent no-op**, not an error or an overwrite. A failed award never fails the receipt ingest.

When the parser can't resolve a warehouse at all, `receipt-success.tsx` shows a dashed-border prompt ("Bulkmate was unable to find the correct warehouse from your receipt") opening `components/WarehousePickerModal.tsx` — a searchable bottom sheet over `warehouses` (name/city/address/postal code, debounced 250ms, publicly readable via `warehouses_public_read`). Selecting one calls `check-in` with `{ receipt_id, warehouse_id }` rather than updating `receipts` directly, so a hand-picked warehouse earns the same reward an auto-matched one does.

The picker is **never required** — the receipt is already stored with a null `warehouse_id` before the prompt appears, and the seed list doesn't cover every warehouse worldwide. A "Can't find my warehouse" action dismisses the prompt into a neutral "Saved without a warehouse" card (still tappable, so it can be linked later); no star is awarded in that case. The skip is screen-local state, not persisted — revisiting the receipt re-offers the picker, which is desirable once the warehouse list grows.

**FR-400 — Ingredient Good/Watch/Avoid Highlighting** ✅ built, live-verified and deployed (latest `barcode-lookup` deploy v32, 2026-10-07). `barcode-lookup` resolves ingredients by exact-UPC lookup against **Open Food Facts** (primary — real NOVA processing group, Nutri-Score, detected additive E-codes, high/low nutrient-level flags), falling back to **USDA FoodData Central** (raw text only, weaker keyword classification) when OFF has no match. Classification is cross-referenced against a curated additive table (`_shared/additiveDatabase.ts`, ~25 E-codes with documented concern) rather than guessing from ingredient-label wording. Cached 30 days. Rendered as an `IngredientsCard` on the product detail screen (`costco-mobile/app/product/[sku].tsx`) with NOVA/Nutri-Score badges — only shown when a match is found, no error state when it isn't. Full detail in `costco-backend/EXTERNAL_APIS.md`.

History: first version (2026-08-06, before the OFF rebuild) used only USDA FDC with a plain substring keyword classifier. Live-testing that day found two real bugs, both fixed same-day: (1) RapidAPI's search doesn't recognize raw UPC/EAN barcodes, so the ingredients it had already resolved were being discarded behind a hard 404 — fixed via the `source: 'partial'` response path (still in place); (2) the substring classifier missed plain "sugar" entirely. Coverage verification for Open Food Facts (2026-08-06): 5/5 real Kirkland UPCs found individually, plus 1,557 Kirkland Signature and 567 Costco-brand-tagged products confirmed in the database via their search API — strong enough signal to make OFF primary and demote FDC to a fallback. **The OFF rebuild is deployed** — `barcode-lookup` redeployed and the `20260807000000_ingredient_off_fields.sql` migration applied, both confirmed 2026-08-06. Spot-verified live against the deployed function that same day: an unmatched-by-price barcode still returned real Open Food Facts ingredient text with a clean tally and correct empty-state pricing sections, and a fully-unmatched barcode returned a clean "Product Not Found" state with no crash.

**Status caveat**: all of the above is code-complete but **has not been exercised end-to-end on a real device/build** — `TEST_PLAN.md` at the repo root has ~90 test cases across 14 features and all are still marked ⬜ Pending.

## Non-Functional Requirements

- **NFR-01 Security**: RLS policies enforce per-user access at the DB level (see `20260626000000_security_hardening.sql`). **Verified live 2026-08-11** via `pg_policies`: `receipts` SELECT/DELETE are both `auth.uid() = user_id`, `receipt_items` has SELECT/INSERT/UPDATE scoped through its parent receipt, and `feature_requests` has INSERT-only for anon (no SELECT — a write-only public inbox, by design). Mobile screens additionally pass an explicit `.eq('user_id', ...)` as defense-in-depth; RLS remains the actual enforcement. No app-layer AES-256 field encryption on top of that — if stricter at-rest encryption is required, that's still open work.
- **Handy**: `supabase db query --linked "<SQL>"` runs read-only SQL against the remote DB — the fastest way to verify a policy/schema claim instead of assuming. (Without `--linked` it targets the local Docker DB, which isn't running.)
- **NFR-02 Performance**: Barcode lookup (`barcode-lookup` function) targets < 350ms via `product_lookups` cache-first, RapidAPI live-fetch fallback.
- **NFR-03 Scalability**: No load testing has been done against the 50k evaluations/minute OCR batch target from the original spec — not yet relevant at solo-dev/pre-launch scale.

## Data Sourcing (No Official Costco API)

Costco has no public developer API. Do not call `api.costco.com` or any Costco internal endpoint — they're session-cookie protected and will break without notice. Three sources are used instead — see `costco-backend/EXTERNAL_APIS.md` for full detail on each (endpoint, auth, caching, fallback behavior):

1. **RapidAPI `costco-live-data.p.rapidapi.com`** — barcode/SKU → pricing, used by `barcode-lookup` and `price-match-check`. Requires `RAPIDAPI_KEY` set as an Edge Function secret. (Unwrangle/Apify were evaluated early on but RapidAPI is what's actually wired up.)
2. **Open Food Facts** — barcode/UPC → real structured ingredient classification (NOVA, Nutri-Score, additive E-codes, nutrient levels), used by `barcode-lookup` as the primary source for the good/watch/avoid ingredient highlighting. Free, no key required (descriptive User-Agent required instead). Coverage confirmed via manual spike: 5/5 real Kirkland UPCs found, 1,557 Kirkland Signature + 567 Costco-brand-tagged products in the database.
3. **USDA FoodData Central** — same ingredient feature, but only as a fallback when Open Food Facts has no match for a UPC; returns raw ingredient text only, classified with a weaker keyword heuristic. Free, requires `USDA_FDC_API_KEY`.
4. **Crowdsourced OCR ledger** — every receipt scan captures SKU + price + warehouse + date into `receipt_items`/`products`, building an internal historical price index over time.

## UI Color Palette ("Warehouse Red & Cream" design system)

Adopted app-wide 2026-08-04, replacing the earlier "Warm Intelligence" palette. Lives entirely in `costco-mobile/constants/colors.ts` as `LightColors` + `DarkColors` (same token names in both, so screens never branch on scheme themselves) — there is no separate `colors.warehouse.ts` file; that was a temporary parallel file used only by the now-deleted `app/(demo)/` mockup screens (see below) and no longer exists.

| Token | Hex (light) | Usage |
|---|---|---|
| Costco Red | `#D1373A` | Primary CTAs |
| Executive Navy | `#1B2A4A` | Authority/totals (inverts to a light cream in dark mode — see caveat below) |
| Gold Star Accent | `#C9A84C` | Badges/gamification |
| Background (warehouse cream) | `#FDFAF3` | Screen background |

Full design conventions (Pressable over TouchableOpacity, shadow tokens, ALL-CAPS section labels, safe-area insets, etc.) live in `costco-mobile/constants/theme.ts` — follow the existing patterns there rather than hardcoding new values.

**Dark mode** (added 2026-08-05): `contexts/ThemeContext.tsx` provides `useThemeColors()`/`useTheme()`; user picks Light/Dark/System in Profile → Preferences → Appearance, persisted via AsyncStorage. Screens build their `StyleSheet` via a `makeStyles(Colors)` factory called with `useMemo` inside the component (StyleSheets can't be reactive at module scope) — this is the established pattern, follow it for any new screen.

**Caveat for new opaque-fill UI** (chips, avatar circles, active pills, badge stamps): dark mode's gray scale is the light scale *reversed*, and a few brand tokens (`executiveNavy*`) invert too, so they read correctly as *text* on a dark background. That inversion breaks anything reusing those same tokens as a **solid background fill** paired with hardcoded white text/icons — the fill goes light while the text stays white, and both vanish into each other. Two such bugs were found and fixed this way already (profile avatar, ScanFAB speed-dial labels). Use the non-inverting `navySolid` / `darkSolid` tokens for this instead of `executiveNavy*` or `gray[700+]`. See `costco-mobile/docs/design-system/reference-app-audit-2026-08-05.md` for the full writeup and a suggested automated-contrast-check follow-up.

The `app/(demo)/` design-system preview screens (a fake-data showcase of this palette + scan/celebration animations) were built 2026-08-04 and removed 2026-08-05 once the palette and animations were adopted directly into the real app — if you see references to them elsewhere, they're stale.

## PostHog / Observability

PostHog is the **sole** analytics/error/session tool (Sentry was removed 2026-08-06) — one project covers usage analytics, funnels, session replay, and error tracking end to end, across both mobile and backend.

**Mobile (`costco-mobile/lib/posthog.ts`)**: initializes `posthog-react-native` from `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST` (injected via `app.config.js` from `.env`, read at runtime via `expo-constants`). `null` (all `posthog?.` calls become no-ops) if either is unset — mirrors the existing external-API-client "never breaks the app" pattern, just for the analytics layer instead of a data fetch.
- `PostHogProvider` + `PostHogErrorBoundary` wrap the app in `app/_layout.tsx`, with a themed `ErrorFallback` (`components/ErrorFallback.tsx`) instead of a blank screen on an uncaught React render error.
- `errorTracking.autocapture` is on for uncaught exceptions, unhandled promise rejections, and `console.error` calls — this is what actually makes PostHog "catch everything," not just the error boundary (which only sees React render-tree errors).
- `enableSessionReplay: true`, with `maskAllTextInputs`/`maskAllImages` on — replay is masked by default because receipts show real prices and personal purchase data; never disable masking without a specific reason.
- Screen views and app-lifecycle events autocapture by default (`PostHogProvider`'s default `captureScreens: true`, `captureAppLifecycleEvents: true`); touch autocapture is left off.
- Manual `posthog?.capture(...)` calls exist for both the "completed" and "failed" side of every core funnel step (sign-up, sign-in, receipt upload, product scan, warehouse check-in) — the failed-side events (`*_failed`, with a `reason`) are what make funnel drop-off/issue analysis possible; they were largely missing before 2026-08-06 and were added specifically for this.
- `posthog?.identify()` / `posthog?.reset()` are called on sign-in/sign-out in `_layout.tsx` to tie events to a user without needing that logic duplicated per screen.

**Backend (`costco-backend/supabase/functions/_shared/posthog.ts`)**: `capturePostHogEvent` / `capturePostHogException`, called from the top-level `catch` of every Edge Function (`ingest-receipt`, `barcode-lookup`, `check-in`, `price-match-check`) so server-side failures land in the same PostHog project as mobile crashes. Deliberately uses a raw `fetch` to PostHog's `/capture/` HTTP endpoint rather than the `posthog-node` SDK — `posthog-node` buffers and flushes on an interval, which doesn't survive a Deno Edge Function's isolate being frozen the instant a response returns; a single awaited fetch does. Never throws, same rule as every other `_shared` client.
- **`POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` are set** as Edge Function secrets (2026-08-11, via `supabase secrets set`, same values as `costco-mobile/.env`), so backend capture is live rather than a no-op. Verified after setting: both error paths (`ingest-receipt`, `barcode-lookup` on malformed JSON) still return correctly in ~1s with the now-real awaited PostHog capture in the path, and the happy path is unaffected. **Not verified: whether PostHog actually received the events** — the project token is write-only, so confirming delivery needs a look at PostHog's Activity/Error Tracking view in the dashboard.

## Build Status (verified 2026-08-04)

**Sprints 1–9: code-complete.** Auth, receipt OCR ingestion, price matching, push notifications, barcode scanning, warehouse check-in, badge engine, spend analytics dashboard, home screen — all screens and Edge Functions exist, `npx tsc --noEmit` passes clean, no TODOs in the codebase.

**Not done:**
- ~~Real-device build blocked~~ **Done 2026-08-11 — the app is built, signed, and installed on a physical iPhone.** See "Device build — the five blockers" below; every one is fixed and the fixes are durable. On-device *testing* of camera/GPS/push flows is still pending (that's now just legwork, not a blocker).
- `eas.json` / EAS build configuration — still the path to TestFlight / sharing builds with anyone else
- ~~Apple Developer Program enrollment~~ **Done** (enrolled + PLA accepted 2026-08-11).
- ~~Sign in with Apple not working~~ **Done 2026-08-11.** The failure (`Provider (Issuer appleid.apple.com is not enabled)`) was Supabase-side, not app code. Fixed by enabling the Apple provider with Client ID `com.twonk0609.costco-app` (**stale — bundle ID is now `com.twonk0609.bulkmate`; the Apple App ID, Services ID and Supabase provider all need updating or Apple sign-in breaks**) and a client-secret JWT. Verified via `GET /auth/v1/settings` → `apple: true`. **The secret expires 2027-02-10** (Apple's 6-month cap) — regenerate with `costco-backend/scripts/generate-apple-client-secret.mjs`, which takes the `.p8` + Key ID and mints the ES256 JWT Supabase expects (pasting the raw `.p8` gives "Secret key should be a JWT"). The `.p8` itself is gitignored (`*.p8`) — Apple only lets you download it once.
- ~~Confirming Edge Function secrets are set~~ **Done (2026-08-11).** `supabase secrets list` confirms all of them present: `GOOGLE_CLOUD_VISION_API_KEY`, `RAPIDAPI_KEY`, `USDA_FDC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus the auto-managed `SUPABASE_*` set and the newly-added `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST`. Open Food Facts needs no key.
- ~~Privacy policy~~ **Done 2026-10-06** — live at `https://everyday-labs.org/bulkmate/privacy/` (source of truth `costco-mobile/docs/PRIVACY.md`; the website copy must be re-synced on every change). Support URL: `https://everyday-labs.org/bulkmate/support/`.
- **Auth + notifications session (2026-10-06):** Google sign-in, in-app password reset and email-confirmation by 8-digit code (no links — the Site URL is `bulkmate://`, there's no web callback), provider names prefilled by the `handle_new_user` trigger, Home name card, Brevo SMTP/API email, immediate price-drop emails. Verified on device: Google sign-in + name on first load. Not yet verified: email sign-up code flow, password reset, Apple sign-in after the bundle rename. Uncommitted work is on branch `feature/auth-google-password-reset` (not merged to `main`, not pushed).
- App Store screenshots/listing copy
- ~~Warehouse seed data was Bay Area-only~~ **Done.** `costco-backend/scripts/seed-warehouses-from-google-places.mjs` generates a global seed with `tier` derived from real Google Places rating × review count. **Applied and live-verified: 723 warehouses** (511 USA, 74 Canada, 25 Mexico, 24 UK, 21 Japan, 18 South Korea, 16 Australia, + others), tiered 574 Common / 129 Rare / 20 Legendary. Migrations `20260809000000` (schema) through `20260809000006` (data cleanup) are all applied. Re-run the script periodically — Costco opens/closes locations and ratings drift.
- Google Places-seeded warehouses get a synthetic `warehouse_code` (`GP-######`), not Costco's real store number — `ingest-receipt` now self-heals this: when a receipt's exact code lookup misses, it falls back to matching the receipt header's OCR text against a seeded warehouse's **postal code first, city name second** (postal code disambiguates cities with more than one Costco), links the receipt, and overwrites that warehouse's placeholder code with the real one parsed from the receipt (see `PARSER_DECISIONS.md`, "Warehouse resolution — postal-code/city fallback"). **Not yet live-verified** against a real non-Bay-Area receipt.
- ~~`20260805000000_receipt_items_update_policy.sql` not confirmed applied~~ **Done — verified live 2026-08-11.** `pg_policies` confirms `receipt_items` has all three policies (`receipt_items_select_own`, `_insert_own`, `_update_own`), so inline line-item editing on receipt-success works. `supabase migration list` also shows every local migration matched remotely, with no drift.
- ~~`POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST` need to be set as Supabase Edge Function secrets~~ **Done** — both confirmed present via `supabase secrets list` (2026-10-08), so backend error/event capture is live (see "PostHog / Observability" above).

**Receipt pipeline verified end-to-end on a physical device (2026-08-11).** First real receipt (Almaden #470) scanned on-device surfaced two genuine parser bugs, both fixed, redeployed, and re-verified by rescanning:
1. **CRV deposit stole an item's price** — the `skipNextPrice` flag assumed a bottle-deposit price immediately follows its `CA REDEMP V` barcode; in this receipt's column ordering it followed the *item's* price, so a $12.99 item was stored as $0.30. Replaced the two-pass zip with a greedy "assign each price to the oldest unpriced SKU" pass, which removes the flag entirely.
2. **Repeat SKUs weren't merged** — Costco prints each unit of a multi-buy on its own line, so buying two showed as two rows with no quantity. Now merged on **SKU + unit price** (SKU is product identity; OCR'd descriptions are not reliable — the same product read as both "CUCNT WIN" and "KS COCNT TR"). Same SKU at *different* prices deliberately stays split.

Both live-confirmed by rescan: 4 rows / 5 units, `$12.99 ×2`, total reconciling to the printed $48.75. See `costco-backend/PARSER_DECISIONS.md` for the full trace and the 10-case layout regression suite.

## Device build — the five blockers (all fixed 2026-08-11)

Getting the app onto a physical iPhone hit five distinct failures. Each fix is durable; recorded here so they aren't re-diagnosed from scratch.

1. **Apple Program License Agreement not accepted.** Symptom: `Unable to process request - PLA Update available`, and profile generation fails. Enrolling and paying isn't enough — the PLA must be accepted at developer.apple.com before Apple will issue any provisioning profile.
2. **`NODE_BINARY` pinned to a deleted Homebrew path.** `ios/.xcode.env.local` had `/opt/homebrew/Cellar/node/26.6.0/bin/node`; Homebrew had upgraded to 26.7.0 and deleted that directory, so the Hermes script phase died with `No such file or directory`. Fixed by pointing at the stable symlink `/opt/homebrew/bin/node`, which survives version bumps. **Recurs on any Node major upgrade if someone re-pins a Cellar path.**
3. **A space in the project path.** The folder was `~/Desktop/Costco app`. `expo-constants` generates `bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"` — unquoted, so bash split at the space and tried to run `/Users/.../Desktop/Costco`. **React Native iOS builds do not support spaces in the project path.** Fixed by renaming to `costco-app`. Don't reintroduce a space.
4. **Stale CocoaPods state after the rename.** Codegen outputs (`*JSI-generated.cpp`, `*-generated.mm`) went missing with paths baked in from the old location. Fixed with `pod install`.
5. **Xcode user script sandboxing.** Xcode 15+ defaults `ENABLE_USER_SCRIPT_SANDBOXING = YES`, which blocks React Native's bundle script from writing `ip.txt` into the `.app`. Editing `project.pbxproj` works but `expo prebuild` reverts it, and `expo-build-properties` doesn't expose this setting — so there's now a custom config plugin at `costco-mobile/plugins/withScriptSandboxDisabled.js`, registered in `app.json`. Verified by resetting the value to `YES`, running `prebuild`, and confirming it returned to `NO`.

**Simulator Release builds crash the Swift compiler** (Xcode 26.5 / Swift 6.3.2, seen 2026-10-06): compiling the PostHog pod for the iOS 26.5 simulator segfaults `swift-frontend` while loading the prebuilt `WebKit`/`Network` modules (`Stack dump` in the log, no `error:` line). Workaround: pass `SWIFT_ENABLE_EXPLICIT_MODULES=NO` to `xcodebuild` for simulator builds. Device builds are unaffected. Likely fixed by an Xcode update.

**Debug vs Release on device:** a Debug build has no embedded JS bundle — it streams from Metro over the LAN and dies with `No script URL provided / unsanitizedScriptURLString = (null)` if the phone can't reach the Mac. **For real-world testing (e.g. GPS check-in at an actual warehouse), build Release** — it embeds `main.jsbundle` (~5.6 MB) and runs fully standalone:
```bash
cd costco-mobile/ios && xcodebuild -workspace Bulkmate.xcworkspace \
  -configuration Release -scheme Bulkmate \
  -destination "id=<device-udid>" DEVELOPMENT_TEAM=XX3T25NCVV \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration
xcrun devicectl device install app --device <device-udid> <path-to>/Bulkmate.app
```

**All four Edge Functions redeployed 2026-08-11** via `supabase functions deploy` (CLI works now — see Commands), carrying the QA-pass fixes below plus the PostHog exception capture added earlier. Live-verified after deploy: `barcode-lookup` returns real Open Food Facts data on a fresh UPC (NOVA 1, Nutri-Score B, 6 classified ingredients, `source: 'off'`) and correct cached data on a repeat lookup — confirming the stale-cache bug is actually fixed in production, not just locally. `check-in` correctly 401s without auth, `ingest-receipt` 400s on missing params and 500s (into the PostHog catch) on malformed JSON, `price-match-check` reachable.

**Final QA pass (2026-08-11).** Two parallel deep code reviews (mobile + backend) plus a simulator visual walkthrough. Six real bugs found and fixed:
1. **Analytics double-counted spend** (`app/(tabs)/analytics.tsx`) — multiplied `unit_price × quantity`, but the OCR parser stores the *full line price* in `unit_price` (see `PARSER_DECISIONS.md`; `receipt-success.tsx` already documented this and deliberately didn't multiply). Any item edited to quantity > 1 showed inflated spend, disagreeing with every other screen.
2. **Home stats silently capped at 50 receipts** (`app/(tabs)/index.tsx`) — `Total Spent`/`Receipts` came from a `.limit(50)` query while Analytics used an unbounded one, so the two screens would visibly disagree past 50 receipts. Split into a separate unbounded totals query.
3. **Stale ingredient cache returned empty data** (`barcode-lookup/index.ts`) — pre-OFF-rebuild rows stored `ingredients_json` as a flat array; the new code read `.items` off it, got `undefined`, and rendered an empty ingredients card for up to 30 days instead of refetching. Now detects the old shape via `Array.isArray` and falls through to a refetch, self-healing the row.
4. **OCR header slicing didn't trim blank lines** (`ingest-receipt/index.ts`) — Vision commonly emits blank lines near the top, which shrank the effective postal-code search window below the intended 12 lines.
5. **Full receipt OCR text was logged in plaintext** (`ingest-receipt/index.ts`) — member numbers and every line item went to Supabase function logs on every scan. Now logs length only; use the RLS-scoped `ocr_raw` column for debugging.
6. **`receipts.tsx` failed to load after adding user-scoping** — its `useFocusEffect` had an empty dep array, so `load()` fired before auth resolved and queried `user_id = ''` (malformed UUID → error state). Caught in simulator testing, fixed by keying the effect on `session?.user.id`.

Also hardened: all `receipts` queries now pass an explicit `.eq('user_id', ...)` alongside RLS (defense-in-depth — previously some screens relied on RLS alone while sibling queries in the same file filtered explicitly; note `receipt_items` has no `user_id` column and is correctly still RLS-only, scoped via its parent receipt), and `receipt-success.tsx`'s full-screen image viewer switched from a module-scope `Dimensions.get()` (stale on rotation/iPad split-screen) to the reactive `useWindowDimensions()` hook.

Visual verification in the iOS Simulator: Home, Product Detail, History, Receipts, Analytics, and Profile all render correctly with zero Metro runtime errors. **Dark mode was not visually verified** — `simctl ui ... appearance dark` didn't propagate to the running Expo Go app; check it manually via Profile → Preferences → Appearance.

**Recently added (2026-08-06):** ingredient good/watch/avoid highlighting on the product detail screen (FR-400, see above) went through three rounds the same day: (1) shipped with USDA FDC + a substring keyword classifier; (2) live-testing against the deployed function found RapidAPI doesn't recognize raw UPC/EAN barcodes, so successfully-resolved ingredients were being discarded behind a hard 404 — fixed via the `source: 'partial'` response path, and separately found the keyword classifier missed plain "sugar"; (3) rebuilt entirely around **Open Food Facts** as the primary classification source (real NOVA/Nutri-Score/additive data via a new curated `_shared/additiveDatabase.ts`, ~25 E-codes), demoting USDA FDC to a fallback for raw text only. Mobile's `IngredientsCard` gained NOVA/Nutri-Score badges — while building those, caught and fixed a real contrast bug (white text on the Nutri-Score B/C/D badge colors, computed as low as 1.53:1) before it ever shipped. **This rebuild is deployed** — `barcode-lookup` redeployed and the `nova_group`/`nutriscore_grade` migration applied, both confirmed 2026-08-06.

Separately that day: the four (now five) external API clients were consolidated into `costco-backend/supabase/functions/_shared/`, one file per API, documented in `costco-backend/EXTERNAL_APIS.md` — this also fixed a real gap where `barcode-lookup`'s RapidAPI call had no error handling (a network failure there would have 500'd the whole product lookup instead of degrading gracefully, unlike the equivalent call in `price-match-check`, which already had it).

**Recently added (2026-08-06, later same day):** home screen's separate "Recently Viewed" (horizontal product scroll) and "Recent Receipts" (vertical list) sections were merged into a single **Recent** feed (`costco-mobile/app/(tabs)/index.tsx`) — receipts and viewed products sorted together newest-first, grouped under day dividers (Today / Yesterday / N days ago / date), with All / Receipts / Viewed filter chips and an empty-state message when a filter yields nothing. "See all" now points at the existing `/history` screen instead of the receipts-only `/receipts` route. Live-verified in the iOS Simulator via Expo Go against the real deployed backend: feed sorts/groups correctly, updates live after a new product view, "See all" navigation works, and product-detail fallback states (no price data, no ingredients match, true 404) all degrade cleanly with no crashes.

**Recently added (2026-08-06, later same day):** PostHog made the sole analytics/error/session tool, replacing Sentry (`@sentry/react-native` removed from mobile entirely — package, `app.json` plugin, DSN init in `_layout.tsx`). Enabled error-tracking autocapture (uncaught exceptions, unhandled rejections, console errors) and masked session replay in `lib/posthog.ts`; added a themed `ErrorFallback` for `PostHogErrorBoundary`; added the missing "failed" half of every core funnel event (`sign_in_failed`, `sign_up_failed`, `receipt_upload_failed`, `product_scan_failed`, `warehouse_check_in_failed`) so drop-off is actually visible, not just success. Also wired PostHog into the backend for the first time — `_shared/posthog.ts`, called from every Edge Function's top-level catch — so server-side failures land in the same project. See "PostHog / Observability" above for the full picture.

**Recently added (2026-08-05):** dark mode (Light/Dark/System, Profile → Preferences → Appearance); scan/check-in celebration animations (`components/ScanEffects.tsx` — drawn checkmark, confetti, ring halo, star toss, wobble, viewfinder sweep) wired into `receipt-camera.tsx` and the Home check-in modal; inline-editable receipt line items on `receipt-success.tsx` (tap a row to fix an OCR misread). See `costco-mobile/docs/design-system/reference-app-audit-2026-08-05.md` for a reference-app design audit with a prioritized list of what to build next (dedicated Alerts screen, unified Scan screen with per-mode coaching, additional celebration animations).

## Deployment

| Component | Platform |
|---|---|
| Mobile builds | Expo EAS (not yet configured) |
| OTA updates | EAS Update, once builds exist |
| Backend + DB | Supabase (Postgres + Auth + Edge Functions + Storage) |
| Analytics, error tracking & session replay | PostHog |
| CI/CD | None for v1 (manual deploys) |
