# Bulkmate — Test Plan

**Last updated:** 2026-10-06  
**Status legend:** ⬜ Pending · 🔄 In Progress · ✅ Pass · ❌ Fail

---

## Current testing status (2026-08-11)

**Verified in the iOS Simulator (Expo Go, against the real deployed backend):** Home screen (stats, Recent feed with day dividers + filter chips), Product Detail (including all three fallback states: no price data, no ingredients match, true 404), Receipt History, unified History screen, Spend Analytics, and Profile all render correctly with zero runtime errors. Warehouse data verified live: 723 rows across 11+ countries.

**Verified on a physical iPhone (2026-08-11):** the full receipt pipeline end to end — camera capture → Google Vision OCR → parsing → line-item display → totals. Confirmed against a real Almaden #470 receipt: 5 units across 4 rows, instant savings captured, multi-buy merged by SKU, and the total reconciling to the printed $48.75. Two real parser bugs were found and fixed via this receipt (CRV deposit stealing an item's price; repeat SKUs not merged) — see `costco-backend/PARSER_DECISIONS.md`.

**Not yet verified — needs a real device:**
- Barcode scanning (the simulator has no usable camera)
- Real GPS check-in at an actual warehouse (the 50m radius is enforced server-side)
- Push notifications (removed from Expo Go in SDK 53 — needs a dev build)
- Sign in with Apple
- **Dark mode** — `simctl ui appearance dark` didn't propagate to the running Expo Go app; check manually via Profile → Preferences → Appearance

**Blocker for device testing:** Apple Developer Program enrollment is pending. A free Personal Team can't provision this app because it uses both Sign In with Apple and Push Notifications. See `CLAUDE.md` → Build Status for the workaround if you want to test before enrollment clears.

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
| 1.7 | Email sign-up code | Register → enter the 8-digit code from the email | Signed in, lands on Home; email is from Bulkmate &lt;noreply@everyday-labs.org&gt; | ⬜ |
| 1.8 | Wrong / resent code | Enter a wrong code; tap Resend code | "Code not accepted"; a new email arrives | ⬜ |
| 1.9 | Unconfirmed sign-in | Register, quit before the code, then sign in | Fresh code sent, code screen opens | ⬜ |
| 1.10 | Google sign-in (new) | Tap Sign in with Google with a new account | Home greets you by your Google first name on first load | ✅ device 2026-10-06 |
| 1.11 | Google cancel | Open the Google sheet, close it | No alert, stays on login | ⬜ |
| 1.12 | Google re-sign-in | Sign out → Google again | Account picker shows; same user | ⬜ |
| 1.13 | Password reset | Forgot password? → email → 8-digit code → new password | Lands on Home; new password works, old one fails | ⬜ |
| 1.14 | Apple sign-in after rename | Sign in with Apple on the Bulkmate build | Works (needs `com.twonk0609.bulkmate` in Supabase's Apple Client IDs) | ⬜ |
| 1.15 | Name card | New email account → Home | "What should we call you?" card; tap → Edit Profile; ✕ hides it for good | ⬜ |

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
| 3.1 | Happy path | Point camera at a real Costco receipt, tap capture | Spinner shows, then routes to receipt-success with parsed items | ✅ 2026-08-11 (device) |
| 3.2 | Item list accuracy | Check parsed items | SKUs, prices, and savings match the physical receipt | ✅ 2026-08-11 — Almaden #470, 5 units / 4 rows, total $48.75 matches receipt |
| 3.3 | Discount capture | Receipt with instant savings | Negative `X.XX-` amounts captured as `discount_amount` | ✅ 2026-08-11 — $2.30 instant savings captured on BIENA EDMAME |
| 3.4 | Warehouse match | Receipt from a seeded warehouse | Correct warehouse name shown on success screen | ⬜ (receipt was Almaden #470 — a `GP-` seeded row, so this also exercises the self-healing `warehouse_code` path; not yet confirmed) |
| 3.5 | Duplicate receipt | Scan same receipt twice | `duplicate: true` flag returned; user notified (not a crash) | ⬜ |
| 3.6 | Multi-buy merged by SKU | Receipt with the same SKU on two lines | One row with quantity ×2, correct line total, no false item-count mismatch | ✅ 2026-08-11 — SKU 1518783 → `$12.99 ×2` |
| 3.7 | CRV deposit not mistaken for item price | Receipt with `CA REDEMP V` bottle-deposit lines | Item keeps its real price; deposit excluded from item rows | ✅ 2026-08-11 — was the root cause of a wrong total; fixed and re-verified on device |

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
| 7.7 | Daily sweep runs | Check `cron.job_run_details` after 08:00 UTC | `daily-price-match-sweep` status `succeeded` (it failed every run until pg_net was enabled 2026-10-06) | ✅ 2026-10-07 (0 items in window) |
| 7.8 | No repeat alerts | Same drop found by two sweeps | One push / one email total | ⬜ |
| 7.9 | Deeper drop | Price falls further after an alert | Notifies again; a dismissed alert reappears | ⬜ |
| 7.10 | Price-drop email | New drop for a user with email alerts on | Email "Price drop: you could get $X back"; View in Bulkmate opens the app on Alerts | ⬜ |
| 7.11 | Email unsubscribe | Tap "Stop price-drop emails" in the email | Confirmation page; Profile → Price-Drop Emails shows off | ⬜ |
| 7.12 | Email toggle | Turn Price-Drop Emails off in Profile | No email on the next drop; push unaffected | ⬜ |

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
| 9.7 | Ingredients — Open Food Facts match | Scan a real UPC OFF has (e.g. a Kirkland Signature item) | Ingredients card shows NOVA + Nutri-Score badges, clean/watch/avoid tally, inline highlighted text, `source: 'off'` | ⬜ |
| 9.8 | Ingredients — no match anywhere | Scan a product neither OFF nor FDC has | No ingredients card shown (screen still renders normally, no error) | ⬜ |
| 9.9 | Ingredients — cache hit | Scan the same product twice | Second lookup doesn't re-call OFF/FDC (check function logs for no `Open Food Facts`/`FDC` line) | ⬜ |
| 9.10 | Ingredients — OFF down, FDC fallback works | Simulate an Open Food Facts network failure (or scan a UPC only FDC has) | Falls back to FDC raw text + keyword classification, `source: 'fdc'`, no NOVA/Nutri-Score badges shown | ⬜ |
| 9.11 | Ingredients — both sources down | Simulate failures for both OFF and FDC (or unset `USDA_FDC_API_KEY`) | Rest of product detail (price, OCR history) still loads normally; no ingredients card, no error surfaced | ⬜ |
| 9.12 | Partial hit — RapidAPI has no match, ingredients do | Scan a real UPC/EAN (RapidAPI's search frequently doesn't recognize 12-13 digit barcodes even when OFF/FDC do — confirmed against multiple real UPCs) | Product screen still opens (`source: 'partial'`), shows name/brand from OFF/FDC + ingredients card; no price section, no crash — not a 404 | ⬜ |
| 9.13 | Nutri-Score badge contrast | View a product with each Nutri-Score grade (A-E) in both light and dark mode | Letter is legible against its badge color for every grade — a real contrast bug (white text on B/C/D) was caught and fixed before shipping | ⬜ |

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
| 12.3 | Recent feed — merged | After scanning receipts and viewing products | Receipts and viewed products appear together in one "Recent" feed, sorted newest-first, grouped under day dividers (Today/Yesterday/N days ago/date) | ⬜ |
| 12.4 | Recent feed — filter chips | Tap "Receipts" / "Viewed" / "All" chips | List narrows to just that kind; "All" shows both again | ⬜ |
| 12.5 | Recent feed — empty filter | Tap a filter chip with no matching items (e.g. "Receipts" when only products have been viewed) | Shows "No receipts yet." / "No viewed products yet." message instead of a blank gap | ⬜ |
| 12.6 | "See all" | Tap See all | Opens `/history` (Receipts / Barcode / Check-ins tabs) | ⬜ |
| 12.7 | Pull to refresh | Pull down on Home | Data reloads | ⬜ |
| 12.8 | Empty state | Fresh account | "No receipts yet" empty state with CTA button | ⬜ |

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
| 14.1 | Avatar | Open Profile | Member badge illustration shown in navy circle (no photo upload — same for every user) | ⬜ |
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
| X.3 | RapidAPI key missing | Barcode lookup returns "Product not found" (or a partial ingredients/OCR-only result if either has data), no crash | ⬜ |
| X.4 | Very long product name | Truncated at 50 chars (alerts), 60 chars (push notifications) | ⬜ |
| X.5 | Price alert delta ≤ $0.01 | No alert created (noise filter) | ⬜ |
| X.6 | Check-in with no warehouses seeded | "No warehouses found" 500 error handled gracefully | ⬜ |
| X.7 | USDA FDC key missing (OFF still primary, needs no key) | Barcode lookup still returns price/OCR data normally; ingredients come from Open Food Facts if it has a match, otherwise no ingredients section | ⬜ |
