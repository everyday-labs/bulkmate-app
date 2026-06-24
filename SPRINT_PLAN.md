# Costco Companion App — Sprint Plan

**Project:** Gamified Costco membership companion app (iOS/Android)
**Solo developer:** balajic0623
**Stack:** React Native + Expo SDK 54 · Supabase Edge Functions · PostgreSQL · Google Cloud Vision

---

## Completed

### Sprint 1 — Foundation *(May 2026)*
- Supabase project, PostgreSQL schema (7 tables + RLS policies)
- Email + Apple Sign In with session persistence (AsyncStorage)
- Expo Router navigation — tabs: Home / Scan / Profile
- Sentry error tracking, NetInfo offline queue drain on reconnect

### Sprint 2 — Receipt OCR Pipeline *(May–Jun 2026)*
- Full-screen camera UI with offline fallback queue
- Supabase Storage upload using `File.bytes()` from expo-file-system/next
- `ingest-receipt` Edge Function: Google Cloud Vision → parser → DB insert
- `receipt_items` table with `discount_amount` column
- Parser: two-pass zip, item count validation, subtotal guard, mismatch warning log

---

---

# Plan A — Full Scope (Q4 2026 Launch)

**Target:** App Store submission by late October, available November 2026
**Cadence:** 2-week sprints · 12 sprints total

---

## 🔄 Sprint 3 — Receipt Polish *(Jun 15–28)* ← YOU ARE HERE

| # | Task |
|---|------|
| 1 | Receipt success screen — show parsed items to user after scan |
| 2 | Receipt history list screen (`/receipts`) |
| 3 | Push notification permission prompt after first successful scan |
| 4 | Swap verbose OCR full-text log back to 100-char preview once parser is stable |

---

## Sprint 4 — Price Match: Data Pipeline *(Jun 29–Jul 12)*

| # | Task |
|---|------|
| 1 | Evaluate Unwrangle vs Apify — pick one, get API key, test a SKU lookup |
| 2 | `price_alerts` table migration (user_id, receipt_item_id, sku, paid_price, current_price, delta, notified_at) |
| 3 | `price-match-check` Edge Function — fetch current price by SKU, compare to `unit_price - discount_amount`, write alert row |
| 4 | Trigger price match check inline after receipt items are inserted |
| 5 | 24h price cache: update `products.current_price` + `price_updated_at` on each lookup |

---

## Sprint 5 — Price Match: Notifications *(Jul 13–26)*

| # | Task |
|---|------|
| 1 | `expo-notifications` — token registration, store in `profiles.push_token` |
| 2 | Send push from Edge Function when price delta found — "You may be owed $X on [item]" |
| 3 | `pg_cron` daily 8 AM sweep of receipt_items within 30-day window |
| 4 | In-app price alert card on Home screen (tap to dismiss) |

---

## Sprint 6 — Product Barcode Scanner *(Jul 27–Aug 9)*

| # | Task |
|---|------|
| 1 | Barcode scan mode on Scan tab using `expo-camera` barcode API |
| 2 | `get-product` Edge Function — SKU → Apify/Unwrangle product lookup |
| 3 | Product detail sheet: name, current price, price history from OCR ledger |
| 4 | < 350ms response target (NFR-02) — cache first, then live fetch |
| 5 | Enable "Scan Product" card on Scan tab (currently disabled) |

---

## Sprint 7 — Warehouse Data + Check-in Core *(Aug 10–23)*

| # | Task |
|---|------|
| 1 | Seed `warehouses` table with US locations (lat/lng from public store locator) |
| 2 | `expo-location` foreground GPS permission flow |
| 3 | Manual tap check-in button on Home screen |
| 4 | `check-in` Edge Function — Haversine 150m validation, insert `user_badges`, increment `total_stars` |
| 5 | Same-day cooldown guard (no double check-in at same warehouse) |

---

## Sprint 8 — Badge Engine + Fan Tier *(Aug 24–Sep 6)*

| # | Task |
|---|------|
| 1 | Seed `badges` table (first visit, 5 visits, Rare warehouse, etc.) |
| 2 | `fan_tier` advancement logic in check-in function (thresholds: 1, 3, 6, 11, 21 visits) |
| 3 | Badge unlock animation on check-in success (Lottie or RN Animated) |
| 4 | Profile screen — fan tier display, total stars, badge grid |
| 5 | Badge detail sheet (earned date, warehouse, rarity) |

---

## Sprint 9 — Home Screen + Analytics *(Sep 7–20)*

| # | Task |
|---|------|
| 1 | Home screen — spend this month, recent receipts, fan tier progress bar, unread alerts |
| 2 | Receipt detail screen (items list with discount highlighted) |
| 3 | Spend analytics: monthly bar chart, top 5 categories by SKU |
| 4 | Empty states for all screens (no receipts, no badges, no alerts) |
| 5 | Loading skeletons + error boundaries throughout |

---

## Sprint 10 — Hardening + TestFlight *(Sep 21–Oct 4)*

| # | Task |
|---|------|
| 1 | Apple Developer account creation |
| 2 | EAS build config (`eas.json`, iOS provisioning, bundle ID) |
| 3 | First TestFlight internal build |
| 4 | Accessibility pass (VoiceOver labels, tap target sizes) |
| 5 | Security audit — RLS policy review, no PII in logs |
| 6 | Bug fixes from TestFlight testing |

---

## Sprint 11 — App Store Submission *(Oct 5–18)*

| # | Task |
|---|------|
| 1 | App Store screenshots (6.7", 6.1", iPad if needed) |
| 2 | App Store listing copy (description, keywords, category) |
| 3 | Privacy policy (required — collects location + receipt data) |
| 4 | Submit for App Review |
| 5 | OTA update pipeline test (`eas update`) |

---

## Sprint 12 — Buffer / Launch *(Oct 19–Nov 1)*

- App Review response buffer (Apple avg 24–48h, can take 1 week)
- Launch day OTA patch if needed
- Android build + Google Play submission (parallel track if time allows)

---

## Plan A Backlog (v2+)

| Feature | Reason deferred |
|---------|-----------------|
| Web dashboard (Next.js) | Mobile-first; solo dev overhead not justified for v1 |
| Google Sign-In | Email + Apple covers launch; revisit at scale |
| AI product summary (Claude API) | Non-essential for v1 value prop |
| On-device OCR | Server-side is simpler and more accurate for v1 |
| Background geo-fencing auto check-in | Foreground manual check-in is sufficient |
| Membership barcode display | Users have the official Costco app |

---

## Plan A Risk Register

| Risk | Mitigation |
|------|-----------|
| Apify/Unwrangle pricing API reliability | Evaluate both in Sprint 4; keep crowdsourced OCR ledger as fallback |
| Apple App Review rejection | Disclose data sources clearly; price data is informational only |
| Parser fails on new warehouse formats | Item count mismatch warning + `ocr_raw` stored for post-hoc debugging |
| pg_cron sweep performance at scale | `receipt_items(transaction_date)` index already exists; add product_id index in Sprint 4 |

---
---

# Plan B — Compressed (Mid-July 2026 Launch)

**Target:** TestFlight by Jul 12, App Store submission by Jul 15
**Cadence:** 1-week sprints · 4 sprints
**Features cut:** Product barcode scanner · Full badge engine · Spend analytics

### What's cut and why

| Feature | Why cut |
|---------|---------|
| Product barcode scanner | Needs Apify integration + separate UI — standalone sprint of work |
| Full badge engine (types, rarity, unlock animations) | Check-in still works, stars still increment — badge *display* deferred |
| Spend analytics dashboard | No meaningful user data to show at launch anyway |
| Badge collection screen | Profile shows tier + star count only |

---

## 🔄 Sprint 3 — Receipt Polish *(Jun 15–21)* ← YOU ARE HERE

| # | Task |
|---|------|
| 1 | Receipt success screen — show parsed items after scan |
| 2 | Receipt history list screen (`/receipts`) |
| 3 | Push notification permission prompt after first successful scan |
| 4 | Swap verbose OCR full-text log back to 100-char preview |

---

## Sprint 4 — Price Match Pipeline *(Jun 22–28)*

| # | Task |
|---|------|
| 1 | Evaluate Unwrangle vs Apify — pick one, get API key, test a SKU lookup |
| 2 | `price_alerts` table migration |
| 3 | `price-match-check` Edge Function |
| 4 | Trigger price match inline after receipt upload |
| 5 | 24h price cache in `products` table |

---

## Sprint 5 — Notifications + Check-in *(Jun 29–Jul 5)*

| # | Task |
|---|------|
| 1 | `expo-notifications` — token registration, store push token |
| 2 | Push notification on price match — "You may be owed $X on [item]" |
| 3 | `pg_cron` daily 8 AM sweep (30-day window) |
| 4 | Seed `warehouses` table (Bay Area first, expand before public launch) |
| 5 | `expo-location` foreground GPS permission flow |
| 6 | Check-in button on Home screen |
| 7 | `check-in` Edge Function — Haversine 150m validation, increment `total_stars`, cooldown guard |

---

## Sprint 6 — Home Screen + TestFlight *(Jul 6–12)*

| # | Task |
|---|------|
| 1 | Home screen — spend this month, recent receipts, price alert card, fan tier pill |
| 2 | Profile screen — display name, fan tier, total stars, receipts scanned |
| 3 | In-app price alert card (tap to dismiss) |
| 4 | Empty states across all screens |
| 5 | Apple Developer account + EAS build config |
| 6 | First TestFlight internal build |
| 7 | Critical bug fixes from TestFlight |

---

## Buffer + Submit *(Jul 13–15)*

- App Store screenshots + listing copy
- Privacy policy
- Submit for App Review

---

## Plan B Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Unwrangle/Apify returns no data for a SKU | Price match shows nothing | Graceful "no data available" state; crowdsourced ledger grows over time |
| Apple Developer account takes 24–48h to activate | Delays TestFlight | **Create account this week if not already done** |
| App Review takes > 3 days | Misses Jul 15 | Submit Jul 6 (Sprint 6 day 1), not Jul 12 |
| Warehouse seed data is manual | Slows Sprint 5 | Scope to Bay Area only; use a public JSON dump of Costco locations |
| Price match API costs exceed free tier | Unexpected bill | Cap lookups to 30 days per user in the pg_cron sweep; add rate limiting |

---

## Plan B Deferred to v2

All Plan A features cut above, plus:

| Feature | Notes |
|---------|-------|
| Product barcode scanner | Full sprint — add in v1.1 OTA update post-launch |
| Badge engine | DB schema already exists; implement post-launch via OTA |
| Spend analytics | Add once there's 30+ days of user data to show |
| Android / Google Play | Submit iOS first; Android parallel track after App Review |
