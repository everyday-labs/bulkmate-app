# Bulkmate — Test Plan

**Last updated:** 2026-10-07  
**Status legend:** ⬜ Pending · 🔄 In Progress · ✅ Pass · ❌ Fail

---

## Automated tests (added 2026-10-07)

Run on every PR by CI (`.github/workflows/ci.yml`) and locally by `./scripts/check-all.sh` (also the pre-push hook). See README → Quality checks & tests.

| Suite | Where | Covers |
|---|---|---|
| Screen tests (RN Testing Library) | `costco-mobile/__tests__/screens/` | Login, register, forgot-password, home, receipts, receipt detail (edit/delete/warehouse picker/notification prompt), profile (alerts toggles, theme, delete account), alerts, analytics, edit profile, history (3 tabs + barcode/check-in history), scan + check-in modals, product detail, root layout auth gate |
| Mobile unit tests | `costco-mobile/lib/__tests__/`, `hooks/__tests__/` | Receipt upload + offline queue drain, push token, Google sign-in wrapper, placeholder names, GPS check-in hook |
| Edge Function handler tests | `costco-backend/supabase/functions/*/handler.test.ts` | All 8 functions against a fake Supabase + external APIs: check-in (radius, cooldown, badges, receipt linking), ingest-receipt (OCR → parse → store, duplicates, warehouse fallback), price-match-check (drops, dedupe, ledger median, push/email), barcode-lookup (cache, RapidAPI, OFF/USDA fallback), delete-account, email-unsubscribe, phone-verification, weekly-price-texts |
| Receipt parser regression (16) | `ingest-receipt/parser.test.ts` | Every layout/bug in `PARSER_DECISIONS.md` |
| Shared helpers | `_shared/*.test.ts` | Alert copy, signed links, Brevo, ingredient rules, fan tiers |
| Visual regression | `costco-mobile/e2e/` (Playwright) | Login, register, forgot-password in light + dark mode |
| Static checks | CI | Prettier, ESLint, `tsc`, `deno check`/`deno lint`, WCAG contrast |

Coverage gates: mobile ≥ 80% lines (currently ~83%), Edge Functions ≥ 90% lines over every source file (currently ~95%).

Everything below is **manual** — it needs a device, camera, GPS or live services.

## Before a manual pass

The feature list these sections test is in `APP_OVERVIEW.md` → Features (each feature names its §).

1. **Build:** a Release build on a physical iPhone (`CLAUDE.md` → Debug vs Release) — Expo Go can't do push, and the simulator can't do camera or GPS.
2. **Accounts:** one fresh email account (for empty states and the sign-up code), one with history; an Apple ID with Hide My Email for 1.14 / 20.5.
3. **Props:** two or three real Costco receipts (one with instant savings, one with a CRV deposit, one from a warehouse outside the Bay Area), a few grocery items with barcodes, and a trip to a warehouse for §10.
4. **Backend checks:** `supabase db query --linked "<SQL>"` to confirm DB rows; Supabase dashboard → Edge Functions → Logs; PostHog → Activity for events.
5. **Mark results** in the Status column with the date and where it ran, e.g. `✅ device 2026-10-12` or `❌ sim 2026-10-12 — <what broke>`.

## Current testing status

**Tally (2026-10-07):** 156 manual cases across 23 features — 8 ✅ pass, 2 ⏸ skipped while SMS is paused, 146 ⬜ pending, 0 ❌.

*Snapshot from 2026-08-11:*

**Verified in the iOS Simulator (Expo Go, against the real deployed backend):** Home screen (stats, Recent feed with day dividers + filter chips), Product Detail (including all three fallback states: no price data, no ingredients match, true 404), Receipt History, unified History screen, Spend Analytics, and Profile all render correctly with zero runtime errors. Warehouse data verified live: 723 rows across 11+ countries.

**Verified on a physical iPhone (2026-08-11):** the full receipt pipeline end to end — camera capture → Google Vision OCR → parsing → line-item display → totals. Confirmed against a real Almaden #470 receipt: 5 units across 4 rows, instant savings captured, multi-buy merged by SKU, and the total reconciling to the printed $48.75. Two real parser bugs were found and fixed via this receipt (CRV deposit stealing an item's price; repeat SKUs not merged) — see `costco-backend/PARSER_DECISIONS.md`.

**Not yet verified — needs a real device:**
- Barcode scanning (the simulator has no usable camera)
- Real GPS check-in at an actual warehouse (the 50m radius is enforced server-side)
- Push notifications (removed from Expo Go in SDK 53 — needs a dev build)
- Sign in with Apple
- **Dark mode** — `simctl ui appearance dark` didn't propagate to the running Expo Go app; check manually via Profile → Preferences → Appearance

~~**Blocker for device testing:** Apple Developer Program enrollment is pending.~~ Cleared — enrolled 2026-08-11 and the app has been built and installed on a physical iPhone since (`CLAUDE.md` → Device build). What remains is legwork: run the device-only sections (§8 push, §9 barcode, §10 GPS check-in, §20 universal links) on a Release build.

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
| 5.4 | Fix an OCR misread | Tap an item row → change description/price → ✓ Done | Row and total update; value survives leaving and reopening the receipt | ⬜ |
| 5.5 | Cancel an edit | Tap a row → change it → ✕ Cancel | Original values kept | ⬜ |
| 5.6 | Full receipt image | Tap "Tap to view full receipt" | Full-screen image; ✕ Close returns; correct on rotation/iPad | ⬜ |
| 5.7 | Share TC# | Tap Share | iOS share sheet with `TC# <transaction number>`; receipt without one shows "TC# not found on receipt" | ⬜ |
| 5.8 | Notification ask | Fresh install, open the first scanned receipt | "Stay in the loop" sheet after ~1.5s; Not Now hides it and it never returns | ⬜ |

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

## Feature 15 — Price Alerts Screen

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 15.1 | Open from Home | With an active alert, tap the alert card / "See all" on Home | Price Alerts screen: ACTIVE list and a "You may be owed" total | ⬜ |
| 15.2 | Claim window | Alert on an item bought 25+ days ago | Days-left shown; "Claim window closing" label inside the last days of the 30-day window | ⬜ |
| 15.3 | Mark as claimed | Tap Mark as claimed | Moves to CLAIMED; total drops; `price_alerts.dismissed_at` set; PostHog `price_alert_claimed` | ⬜ |
| 15.4 | View Receipt | Tap 🧾 View Receipt on an alert | Opens that receipt's detail screen | ⬜ |
| 15.5 | Empty state | Account with no alerts | "No price drops yet" | ⬜ |
| 15.6 | Pull to refresh | Create an alert in the DB, pull down | New alert appears | ⬜ |

---

## Feature 16 — History Screens, Search, Filters & Sorting

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 16.1 | Unified History tabs | Home → See all | Receipts / Barcode / Check-ins tabs; each loads its own list | ⬜ |
| 16.2 | Receipt search | Receipt History → type a warehouse or item | List narrows; "No results" when nothing matches | ⬜ |
| 16.3 | Receipt filters | Apply a warehouse, a date range (Last 30 Days … Last Year) and an amount band (Under $50 … $300+) | Only matching receipts; clearing returns everything | ⬜ |
| 16.4 | Receipt sort | Newest / Oldest / Highest total / Lowest total | Order changes accordingly | ⬜ |
| 16.5 | Month drill-down | Stats → tap a month's bar | Receipt History filtered to that month, labelled with it | ⬜ |
| 16.6 | Barcode history | Scan tab → Barcode → "View all your past lookups" | Past lookups; sort by date or price; tap opens product | ⬜ |
| 16.7 | Check-in history | Scan tab → Check-in → "View all your past visits" | Past visits with rarity; sort by date or stars | ⬜ |
| 16.8 | Load failure | Airplane Mode, open each history screen | "Failed to load …" + Try again (no crash); works after reconnecting | ⬜ |

---

## Feature 17 — Warehouse Matching & Manual Picker

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 17.1 | Auto match outside the Bay Area | Scan a receipt from a non-Bay-Area warehouse | Correct warehouse shown; its `warehouse_code` changes from `GP-…` to the real store number | ⬜ |
| 17.2 | Picker appears | Receipt whose header can't be matched (or set `warehouse_id` null in DB) | Dashed "I'm unable to find the correct warehouse…" prompt | ⬜ |
| 17.3 | Picker search | Open the picker; search by name, city and ZIP | Results update after typing stops (~250ms) | ⬜ |
| 17.4 | Pick a warehouse | Select one | "Visit credited" alert, +1 star dated to the receipt's date, receipt shows the warehouse | ⬜ |
| 17.5 | Skip | Tap "Can't find my warehouse" | "Saved without a warehouse" card; no star; receipt still saved; reopening offers the picker again | ⬜ |
| 17.6 | Same-trip repeat | Two receipts from the same warehouse and day | Second one awards no extra star and shows no error | ⬜ |

---

## Feature 18 — Edit Profile & Preferences

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 18.1 | Edit name | Profile → Edit Profile → change first/last name → Save Changes | Home greeting and Profile show the new name | ⬜ |
| 18.2 | Phone (optional) | Add a phone number, save; then clear it, save | Both save; phone isn't required | ⬜ |
| 18.3 | Cancel | Change a field → Cancel | Nothing saved | ⬜ |
| 18.4 | Save failure | Airplane Mode → Save | "Save failed" alert; form keeps its values | ⬜ |
| 18.5 | Appearance | Profile → Appearance → Dark, Light, System | Every screen switches; choice survives an app restart; System follows iOS | ⬜ |
| 18.6 | Dark-mode legibility | In Dark, visit every screen incl. product detail Nutri-Score A–E, avatar, Scan speed-dial | No white-on-light or dark-on-dark text | ⬜ |

---

## Feature 19 — Deleting Data

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 19.1 | Delete a receipt | Receipt detail → Delete Receipt → confirm | Gone from Home, History and Stats; its items and image are removed (check the Storage bucket) | ⬜ |
| 19.2 | Delete account | Profile → Delete Account → confirm twice | Signed out to login; the same login no longer works | ⬜ |
| 19.3 | Account data gone | After 19.2, query `receipts`, `check_ins`, `price_alerts`, `user_badges` for that user id, and the user's Storage folder | No rows, no images | ⬜ |
| 19.4 | Cancel deletion | Tap Delete Account → cancel at either prompt | Nothing deleted | ⬜ |

---

## Feature 20 — Email Links & Universal Links

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 20.1 | Link opens app | On a phone with the app installed, tap "View in Bulkmate" in a price-drop email | App opens directly on the Alerts screen | ⬜ |
| 20.2 | Fallback page | Open `https://everyday-labs.org/alerts` on a computer / phone without the app | Web fallback page loads | ⬜ |
| 20.3 | AASA served | `curl -s https://everyday-labs.org/.well-known/apple-app-site-association` | JSON with app ID `XX3T25NCVV.com.twonk0609.bulkmate` and the `/alerts` paths | ⬜ |
| 20.4 | Sender & deliverability | Check a received price-drop / auth email's headers | From `noreply@everyday-labs.org`; SPF, DKIM and DMARC pass; not in spam | ⬜ |
| 20.5 | Apple private relay | Apple account with Hide My Email → trigger a price-drop email | Arrives at the relay address (Apple drops it if the domain isn't registered) | ⬜ |

---

## Feature 21 — Website (everyday-labs.org)

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 21.1 | Feedback form | Submit `everyday-labs.org/bulkmate/feedback/` | Success message; row appears in `feature_requests` | ⬜ |
| 21.2 | Feedback is write-only | `GET <SUPABASE_URL>/rest/v1/feature_requests` with the anon key | Empty / denied — nobody can read others' feedback | ⬜ |
| 21.3 | Policy & support | Open `/bulkmate/privacy/` and `/bulkmate/support/` | Load; privacy text matches `costco-mobile/docs/PRIVACY.md` | ⬜ |
| 21.4 | Contact email | Send a mail to `hello@everyday-labs.org` | Arrives in the personal inbox (Cloudflare Email Routing) | ✅ 2026-10-07 |

---

## Feature 22 — Weekly Text Digest (⏸ paused for v1)

Skip 22.2–22.3 until `SMS_ALERTS_ENABLED` is turned on (`costco-mobile/lib/features.ts`). Needs a registered US sender number and Brevo SMS credits.

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 22.1 | Hidden in v1 | Profile → Preferences | No Weekly Texts row | ⬜ |
| 22.2 | Verify phone | (flag on) Turn on Weekly Texts → enter the 6-digit SMS code | Phone verified; toggle stays on | ⏸ |
| 22.3 | Weekly digest | (flag on) Active drops, Friday 3 PM Pacific | One SMS ≤160 chars with "Reply STOP to opt out" | ⏸ |

---

## Feature 23 — Analytics & Error Reporting (PostHog)

| # | Test | Steps | Expected | Status |
|---|------|-------|----------|--------|
| 23.1 | Funnel events | Sign in, scan a receipt, scan a product, check in | Matching events appear in PostHog → Activity for that user | ⬜ |
| 23.2 | Failure events | Wrong password; check in from home | `sign_in_failed`, `warehouse_check_in_failed` with a `reason` | ⬜ |
| 23.3 | Backend errors land | POST malformed JSON to `barcode-lookup` | Exception appears in PostHog Error Tracking (never confirmed so far) | ⬜ |
| 23.4 | Replay is masked | Watch a session replay of a receipt screen | Text inputs and images masked | ⬜ |

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
