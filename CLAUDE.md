# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A gamified Costco membership companion app (iOS/Android, mobile-only for v1) that turns warehouse visits into a "treasure hunt" while providing receipt OCR tracking, sliding-window price-match alerts, and a barcode-based product lookup. Open-source solo side project, not affiliated with Costco. Not monetized.

Repo layout: **three directories in this working tree, two independent Git repos**.

```
Costco app/                  ← this directory (top-level docs, not itself the app code)
├── costco-mobile/           ← separate git repo: Expo + React Native app
├── costco-backend/          ← separate git repo: Supabase migrations + Edge Functions
└── supabase/                ← local Supabase CLI link metadata only (not app code)
```

There is **no monorepo and no NestJS/AWS Lambda backend** — that was the original plan and was dropped on 2026-05-29 in favor of Supabase Edge Functions, because solo-dev overhead wasn't justified. If you see references to a TypeScript monorepo, Next.js web dashboard, or NestJS/Lambda elsewhere, they describe the abandoned plan, not the current app.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile (iOS/Android) | React Native + Expo SDK 54 (Expo Router, file-based navigation) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Database | PostgreSQL via Supabase, no ORM (raw SQL migrations + `@supabase/supabase-js`) |
| Auth | Supabase Auth — email/password + Sign in with Apple; RLS enforces per-user data access |
| Push notifications | Expo Push API |
| OCR | Google Cloud Vision (`DOCUMENT_TEXT_DETECTION`), called server-side from the `ingest-receipt` function |
| Pricing/barcode data | RapidAPI `costco-live-data.p.rapidapi.com` |
| Error tracking | Sentry (`@sentry/react-native`), guard DSN with `if (dsn && dsn !== 'placeholder')` |
| Offline queue | `expo-file-system/next` + AsyncStorage + NetInfo listener |
| Mobile testing | Expo Go (QR code scan) |
| Web dashboard | Not built — deferred to v2+ |

**Expo SDK is pinned at 54** (`costco-mobile/package.json`) to match the installed Expo Go client. Do not upgrade to SDK 56 without first confirming Expo Go on the test device supports it — `costco-mobile/AGENTS.md` currently points at v56 docs, which is stale/wrong; treat the pinned `package.json` version as the source of truth, not that file.

## Commands

```bash
# Mobile (costco-mobile/)
npm install --legacy-peer-deps   # required — peer dep conflicts otherwise
npx expo start --clear           # dev server + QR code
npx expo run:ios                 # run on iOS simulator
npx expo run:android             # run on Android emulator
npx tsc --noEmit                 # typecheck (strict mode)

# Backend (costco-backend/supabase/)
supabase db push                 # apply migrations to linked remote project
supabase functions deploy <name> # deploy a single Edge Function
```

**Supabase CLI auth is currently broken** (token format issue) — Edge Function deploys and secret-setting are done manually via the Supabase dashboard, not `supabase functions deploy` / `supabase secrets set`, until that's resolved.

No `eas.json` exists yet — EAS build config has not been set up (this is the next unstarted piece of work, part of app store prep).

## Architecture

```
costco-mobile (Expo Router)  ──HTTPS──►  costco-backend (Supabase Edge Functions, Deno)
      │                                          │
      │ direct read/write (RLS-scoped)           │ service-role writes
      ▼                                          ▼
                    Supabase PostgreSQL
```

Most reads (receipts, receipt_items, badges, profile) go straight from the mobile app to Supabase via `@supabase/supabase-js`, protected by Row Level Security. Writes that need a trusted external API call or server-side secret go through an Edge Function:

- `ingest-receipt` — receipt image → Google Cloud Vision OCR → `parser.ts` → validated `receipt_items` insert
- `price-match-check` — compares `receipt_items.unit_price - discount_amount` against `products.current_price` (fetched/cached from RapidAPI), writes `price_alerts`, sends push
- `barcode-lookup` — SKU → `product_lookups` cache, else RapidAPI live fetch
- `check-in` — GPS coords + warehouse token → Haversine 50m validation → `check_ins` insert, `total_stars`/`fan_tier` recalculation, badge awarding via `trigger_key`

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

**FR-200 — Receipt OCR Ingestion** ✅ built. Camera capture → on-device read via `expo-file-system/next` → upload to Supabase Storage → `ingest-receipt` Edge Function (Google Cloud Vision → two-pass-zip parser, see `costco-backend/PARSER_DECISIONS.md` for the full parsing decision log) → validated insert. Offline queue via AsyncStorage + NetInfo, drains on reconnect.

**FR-300 — Geo-Fenced Check-In & Badge Engine** ✅ built. `check-in` Edge Function: GPS coords + warehouse token → Haversine validation within 50m → insert `check_ins`, recalculate `total_stars` + `fan_tier`, award badges by `trigger_key`, return payload for the client's unlock animation.

**Status caveat**: all of the above is code-complete but **has not been exercised end-to-end on a real device/build** — `TEST_PLAN.md` at the repo root has ~90 test cases across 14 features and all are still marked ⬜ Pending.

## Non-Functional Requirements

- **NFR-01 Security**: RLS policies enforce per-user access at the DB level (see `20260626000000_security_hardening.sql`). No app-layer AES-256 field encryption is implemented on top of that — if stricter at-rest encryption is required, that's still open work.
- **NFR-02 Performance**: Barcode lookup (`barcode-lookup` function) targets < 350ms via `product_lookups` cache-first, RapidAPI live-fetch fallback.
- **NFR-03 Scalability**: No load testing has been done against the 50k evaluations/minute OCR batch target from the original spec — not yet relevant at solo-dev/pre-launch scale.

## Data Sourcing (No Official Costco API)

Costco has no public developer API. Do not call `api.costco.com` or any Costco internal endpoint — they're session-cookie protected and will break without notice. Two sources are used instead:

1. **RapidAPI `costco-live-data.p.rapidapi.com`** — barcode/SKU → pricing, used by `barcode-lookup` and `price-match-check`. Requires `RAPIDAPI_KEY` set as an Edge Function secret. (Unwrangle/Apify were evaluated early on but RapidAPI is what's actually wired up.)
2. **Crowdsourced OCR ledger** — every receipt scan captures SKU + price + warehouse + date into `receipt_items`/`products`, building an internal historical price index over time.

## UI Color Palette ("Warm Intelligence" design system)

| Token | Hex | Usage |
|---|---|---|
| Costco Red | `#E31837` | Primary CTAs |
| Executive Navy | `#005EA6` | Authority/totals |
| Gold Star Accent | `#FFC72C` | Badges/gamification |
| Background (warm parchment) | `#F7F5F2` | Screen background |

Full design conventions (Pressable over TouchableOpacity, shadow tokens, ALL-CAPS section labels, safe-area insets, etc.) live in `costco-mobile/constants/theme.ts` — follow the existing patterns there rather than hardcoding new values.

## Build Status (verified 2026-08-04)

**Sprints 1–9: code-complete.** Auth, receipt OCR ingestion, price matching, push notifications, barcode scanning, warehouse check-in, badge engine, spend analytics dashboard, home screen — all screens and Edge Functions exist, `npx tsc --noEmit` passes clean, no TODOs in the codebase.

**Not done:**
- Real-device/TestFlight testing (`TEST_PLAN.md` all pending)
- `eas.json` / EAS build configuration
- Apple Developer account setup confirmation
- Confirming Edge Function secrets (`GOOGLE_CLOUD_VISION_API_KEY`, `RAPIDAPI_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are actually set on the deployed functions
- Privacy policy (required for App Store — app uses location + receipt data)
- App Store screenshots/listing copy
- Warehouse seed data is Bay Area only (15 locations) — fine for a regional soft-launch, not national

## Deployment

| Component | Platform |
|---|---|
| Mobile builds | Expo EAS (not yet configured) |
| OTA updates | EAS Update, once builds exist |
| Backend + DB | Supabase (Postgres + Auth + Edge Functions + Storage) |
| Error tracking | Sentry |
| CI/CD | None for v1 (manual deploys) |
