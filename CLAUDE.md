# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A gamified Costco membership companion app (iOS, Android, Web) that turns warehouse visits into a "treasure hunt" while providing receipt management, price protection alerts, and spend analytics. Target release: Q4 2026.

## Tech Stack

**TypeScript monorepo** — shared types and business logic across all platforms.

| Layer | Technology |
|---|---|
| Mobile (iOS/Android) | React Native + Expo (Expo Router for file-based navigation) |
| Web dashboard | Next.js (App Router) |
| Backend API | NestJS on Node.js, deployed to AWS Lambda (serverless) |
| Database | PostgreSQL via Supabase (Prisma ORM) |
| State management | Zustand or React Context |
| Styling | NativeWind / Tailwind CSS |
| Testing | Jest (frontend), Supertest (API endpoints) |
| Mobile testing | Expo Go (QR code scan to test on device) |
| Web previews | Vercel (auto-preview on every push) |
| Monitoring | Sentry (crash reporting) |

## Commands

```bash
# Backend (NestJS)
npm run start:dev          # dev server
npm run build              # production build
npm run test               # Jest unit tests
npm run test:e2e           # end-to-end tests

# Mobile (Expo)
npx expo start             # start dev server + QR code
npx expo run:ios           # run on iOS simulator
npx expo run:android       # run on Android emulator
eas build --platform all   # build for App Store / Play Store
eas update                 # OTA update (bypasses app store review)

# Web (Next.js)
npm run dev                # local dev server
npm run build && npm start # production build

# Database (Prisma)
npx prisma migrate dev     # apply schema migrations
npx prisma generate        # regenerate type-safe client
npx prisma studio          # visual DB browser
npx prisma db seed         # seed warehouse locations + badges
```

## Architecture

```
[ TypeScript Monorepo ]
        │
┌───────┼───────┐
▼       ▼       ▼
Mobile  Web    Backend (NestJS / AWS Lambda)
(Expo) (Next)       │
                    ▼
            Supabase PostgreSQL
```

The mobile app handles two on-device hardware concerns independently of the backend:
- **OCR engine**: Camera captures receipt images → parses Warehouse ID, Transaction Date, SKU ID, Unit Price
- **Geo-fencing**: Background GPS watcher using `expo-location`; checks user coordinates against warehouse polygon boundaries (150m radius threshold uses Haversine distance formula)

## Core Data Model (Prisma)

Seven tables with these key relationships:

- `users` → `receipts` (1:M) → `receipt_items` (1:M) → `products` (M:1)
- `receipts` → `warehouses` (M:1)
- `users` → `user_badges` (1:M) → `badges` (M:1) + `warehouses` (M:1)

Key enums:
- `fan_tier`: `KirklandCadet | WholesaleWanderer | BulkBuyer | GoldStarGuru | ExecutiveExplorer`
- `warehouse.tier`: `Common | Rare | Legendary`

`fan_tier` advances automatically when `user.total_stars` crosses visit thresholds (1-2, 3-5, 6-10, 11-20, 21+).

## Functional Requirements

**FR-100 — Sliding Window Price Match**: Background cron job scans `receipt_items` where `transaction_date > NOW() - 30 days`. If `product.current_price < receipt_item.unit_price`, generate a refund voucher payload and push notification. Endpoint: `POST /analytics/price-match-check`.

**FR-200 — Legacy Receipt OCR Ingestion**: Camera captures physical receipt → on-device OCR → `POST /receipts/ingest`. Must extract Warehouse ID, Transaction Date, SKU ID, Net Item Price, cross-validate against DB before committing. Offline queue via `@react-native-async-storage/async-storage` when inside a warehouse with no signal.

**FR-300 — Geo-Fenced Check-In & Badge Engine**: `POST /gamification/check-in` accepts GPS coordinates + store token. Haversine validation within 150m → insert `UserBadge`, recalculate `total_stars`, return updated `fan_tier` + splash animation trigger.

## Non-Functional Requirements

- **NFR-01 Security**: Receipt transaction records and payment identifiers encrypted at rest with AES-256.
- **NFR-02 Performance**: Barcode lookup (SKU → inventory + pricing + reviews) must return in < 350ms.
- **NFR-03 Scalability**: OCR batch processing must sustain 50,000 evaluations/minute during peak periods.

## Data Sourcing (No Official Costco API)

Costco has no public developer API. Pricing and inventory data comes from two sources:

1. **Third-party scraper APIs** (Unwrangle, Apify) — query by SKU, returns pricing and local inventory JSON.
2. **Crowdsourced OCR ledger** — every receipt scan captures SKU + price + warehouse + date, building an internal historical price index over time.

Do not attempt to call `api.costco.com` or rely on Costco's internal endpoints — they are protected by session cookies and will break without notice.

## UI Color Palette

| Token | Hex |
|---|---|
| Costco Red | `#E31837` |
| Executive Navy | `#005EA6` |
| Gold Star Accent | `#FFC72C` |

## MoSCoW Priority (Build Order)

1. **Must Have**: Digital membership barcode display, Legacy OCR receipt ingestion, Basic product search
2. **Should Have**: Geo-fenced check-in engine, Sliding window price matching
3. **Could Have**: Gamified badges + profile tiers, Spend analytics dashboard
4. **Won't Have (v1)**: Peer-to-peer delivery carpools

## Deployment

| Component | Platform |
|---|---|
| Web (Next.js) | Vercel (Hobby free tier → Pro at scale) |
| Mobile builds | Expo EAS |
| OTA updates | EAS Update (bypasses App Store review delay) |
| Backend + DB | Supabase (PostgreSQL + Auth) + AWS Lambda |
| Error tracking | Sentry |
| CI/CD | GitHub Actions → auto-deploy to Vercel + Expo |
