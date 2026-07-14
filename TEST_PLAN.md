# Costco Companion App — Test Plan

**Last updated:** 2026-07-13  
**Model:** Claude Sonnet 4.6  
**Status legend:** ⬜ Pending · 🔄 In Progress · ✅ Pass · ❌ Fail

---

## Feature 1 — Auth

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 1.1 | Email register | Open app → Register with new email + password | Account created, routed to Home tab | ⬜ |
| 1.2 | Email login | Sign out → Login with credentials | Session restored, Home tab loads | ⬜ |
| 1.3 | Apple Sign In | Tap "Sign in with Apple" | Apple sheet appears, on success → Home | ⬜ |
| 1.4 | Sign out | Profile tab → Sign Out | Session cleared, redirected to Login | ⬜ |
| 1.5 | Session persistence | Kill app, reopen | Still logged in (no login screen) | ⬜ |
| 1.6 | Wrong password | Login with bad password | Error message shown | ⬜ |

---

## Feature 2 — Receipt Camera

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 2.1 | Permission prompt | First launch, tap Scan Receipt | iOS permission dialog appears | ⬜ |
| 2.2 | Permission denied | Deny camera → tap Scan Receipt again | "Allow Camera" screen shown | ⬜ |
| 2.3 | Camera view | Grant permission | Full-screen camera opens with instruction overlay | ⬜ |
| 2.4 | Cancel | Tap Cancel | Returns to previous screen, no photo taken | ⬜ |

---

## Feature 3 — Receipt OCR Ingestion

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 3.1 | Happy path | Point camera at a real Costco receipt, tap capture | Spinner shows, then routes to receipt-success with parsed items | ⬜ |
| 3.2 | Item list accuracy | Check parsed items | SKUs, prices, and savings match the physical receipt | ⬜ |
| 3.3 | Discount capture | Receipt with instant savings | Negative `X.XX-` amounts captured as `discount_amount` | ⬜ |
| 3.4 | Warehouse match | Receipt from a seeded warehouse | Correct warehouse name shown on success screen | ⬜ |
| 3.5 | Duplicate receipt | Scan same receipt twice | `duplicate: true` flag returned; user notified (not a crash) | ⬜ |

---

## Feature 4 — Offline Queue

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 4.1 | Offline capture | Turn on Airplane Mode, scan a receipt | "Receipt saved. Will upload when connected." alert shown | ⬜ |
| 4.2 | Queue drain | Turn Airplane Mode off | Receipt uploads automatically, appears in history | ⬜ |

---

## Feature 5 — Receipt Success Screen

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 5.1 | Items list | After successful scan | Each item row shows description, price, discount (if any) | ⬜ |
| 5.2 | Total | Bottom of screen | Matches receipt total | ⬜ |
| 5.3 | Navigate back | Tap Done or back | Goes to receipts list or home | ⬜ |

---

## Feature 6 — Receipt History

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 6.1 | List populates | Scan 2+ receipts, open History | All receipts listed, newest first | ⬜ |
| 6.2 | Tap to open | Tap a receipt row | Opens receipt-success detail screen for that receipt | ⬜ |
| 6.3 | Empty state | Fresh account | "No receipts yet" empty state shown | ⬜ |

---

## Feature 7 — Price Match

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 7.1 | Inline trigger | Scan a receipt | `price-match-check` Edge Function called with `receipt_id` | ⬜ |
| 7.2 | Alert created | Product's current price < what you paid | Row in `price_alerts` table with correct delta | ⬜ |
| 7.3 | Alert card on Home | Return to Home | Price alert card shown with refund amount | ⬜ |
| 7.4 | Dismiss alert | Tap ✕ on alert card | Alert disappears from UI; `dismissed_at` set in DB | ⬜ |
| 7.5 | pg_cron sweep | POST `{ sweep: true }` to Edge Function | All items in last 30 days checked; alerts for price drops | ⬜ |
| 7.6 | No data graceful | SKU not in API and no ledger data | No alert created, no crash | ⬜ |

---

## Feature 8 — Push Notifications

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 8.1 | Permission prompt | Profile → Enable (first time) | iOS permission dialog appears | ⬜ |
| 8.2 | Token saved | Grant permission | `profiles.push_token` populated in DB | ⬜ |
| 8.3 | Already granted | Profile tab after granting | Shows "On" badge, no re-prompt | ⬜ |
| 8.4 | Denied → Settings | Deny permission | "Settings" button shown, tapping opens iOS Settings | ⬜ |
| 8.5 | Price drop push | Trigger price match with delta > $0.01 and token set | Push notification received on device | ⬜ |

---

## Feature 9 — Product Barcode Scanner

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 9.1 | Navigate to scanner | Scan tab → "Scan Product" | Barcode scanner opens | ⬜ |
| 9.2 | Scan a Costco barcode | Point at a product | Barcode read → product detail screen opens | ⬜ |
| 9.3 | Cache hit | Scan same product twice | Second lookup returns in ~50ms, shows `source: cache` | ⬜ |
| 9.4 | API hit | Scan uncached product | RapidAPI called, product name/price/image shown | ⬜ |
| 9.5 | Unknown SKU | Scan non-Costco barcode | "Product not found" message | ⬜ |
| 9.6 | OCR history | Product scanned by others | Price history section shows min/max/avg | ⬜ |

---

## Feature 10 — Warehouse Check-In

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 10.1 | Location permission | Tap Check In (first time) | iOS permission dialog | ⬜ |
| 10.2 | Happy path | At a seeded Costco, tap Check In | Success modal shows warehouse name, +1 star, total stars | ⬜ |
| 10.3 | Too far | Tap Check In from home/office | "Not at a Costco" alert with distance and nearest warehouse | ⬜ |
| 10.4 | Same-day cooldown | Check in twice at same warehouse | "Already Checked In" modal, 0 stars earned | ⬜ |
| 10.5 | Next day | Check in day after previous | New star earned normally | ⬜ |

---

## Feature 11 — Badge Engine + Fan Tier

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 11.1 | First check-in badge | Complete first check-in | `first_checkin` badge shown in modal and Profile | ⬜ |
| 11.2 | 5 check-ins badge | Complete 5 check-ins | `five_checkins` badge unlocked | ⬜ |
| 11.3 | Tier upgrade | Cross a tier threshold (e.g., 3rd star) | Tier upgrade banner shown in check-in modal | ⬜ |
| 11.4 | Fan tier on Profile | Visit Profile after check-ins | Correct tier name, emoji, and progress bar | ⬜ |
| 11.5 | Progress bar | Stars between tiers | Bar fills proportionally toward next tier | ⬜ |
| 11.6 | Max tier | Reach ExecutiveExplorer (21 stars) | "Maximum tier reached" message, bar full | ⬜ |
| 11.7 | Rare warehouse badge | Check into a Rare-tier warehouse | `rare_warehouse` badge awarded | ⬜ |

---

## Feature 12 — Home Dashboard

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 12.1 | Greeting | Open Home | Time-appropriate greeting ("Good morning/afternoon/evening, [name]") | ⬜ |
| 12.2 | Spend stats | After scanning receipts | Total Spent, Total Saved, and Receipts count cards populate | ⬜ |
| 12.3 | Recent receipts | After scanning | Last 3 receipts listed with warehouse, date, item count, total | ⬜ |
| 12.4 | "See all" | Tap See all | Opens full receipt history | ⬜ |
| 12.5 | Pull to refresh | Pull down on Home | Data reloads | ⬜ |
| 12.6 | Empty state | Fresh account | "No receipts yet" empty state with CTA button | ⬜ |

---

## Feature 13 — Spend Analytics

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 13.1 | Empty state | No receipts scanned | "No data yet" empty state | ⬜ |
| 13.2 | Metrics grid | After scanning | Total Spent, In-Store Saved, Price Match, Avg Basket cards show correct values | ⬜ |
| 13.3 | Monthly chart | Data across months | 6-month bar chart renders; current month highlighted in red | ⬜ |
| 13.4 | Top items | Multiple receipt scans | Top 5 items by total spend listed with horizontal bar | ⬜ |
| 13.5 | Savings breakdown | In-store + price match data | Stacked bar with green (in-store) and gold (price match) segments | ⬜ |
| 13.6 | Activity stats | After check-ins + scans | Receipts and Check-ins counters correct | ⬜ |
| 13.7 | Pull to refresh | Pull down | Reloads all analytics | ⬜ |

---

## Feature 14 — Profile Screen

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 14.1 | Avatar initials | Open Profile | First 2 letters of email shown in navy circle | ⬜ |
| 14.2 | Fan tier card | After any check-in | Tier name, emoji, star count, progress bar | ⬜ |
| 14.3 | Badge grid | After earning badges | Grid of badge cards with icon, name, earned date | ⬜ |
| 14.4 | No badges | Fresh account | Empty state: "Check in at a Costco to earn your first badge" | ⬜ |
| 14.5 | Notification toggle | Permission undetermined | "Enable" button shown | ⬜ |
| 14.6 | Pull to refresh | Pull down | Reloads profile + badges | ⬜ |
| 14.7 | Sign out | Tap Sign Out | Returns to login screen | ⬜ |

---

## Cross-Cutting / Edge Cases

| # | Test | Expected | Status |
|---|------|----------|--------|
| X.1 | No internet on any screen | No crash; screens show last loaded data or empty state | ⬜ |
| X.2 | Invalid auth token | API calls return 401, user prompted to re-login | ⬜ |
| X.3 | RapidAPI key missing | Barcode lookup returns "Product not found in cache", no crash | ⬜ |
| X.4 | Very long product name | Truncated at 50 chars (alerts), 60 chars (push notifications) | ⬜ |
| X.5 | Price alert delta ≤ $0.01 | No alert created (noise filter) | ⬜ |
| X.6 | Check-in with no warehouses seeded | "No warehouses found" 500 error handled gracefully | ⬜ |
