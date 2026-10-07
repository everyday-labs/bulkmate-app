# App Overview — Bulkmate

*(Renamed from "Costco Companion" before beta distribution — see the README's naming note.)*

A gamified, open-source Costco membership companion app (iOS/Android, mobile-only for v1), published by **Everyday Labs**. It turns the boring parts of being a Costco member — tracking receipts, catching price drops, remembering which warehouse you visited — into something closer to a collection game. Not affiliated with Costco.

---

## Elevator pitch

Scan your receipt and the app quietly does two useful things: it logs everything you bought, and it watches for 30 days afterward to see if the price drops — so you know when to walk back in and ask for a price adjustment. On top of that utility layer sits a game layer: checking in at a warehouse (GPS-verified) earns stars, stars level you up through five fan tiers, and milestones unlock badges.

---

## Features

Complete inventory as of 2026-10-07, grouped by area. **Test** points at the matching section of
`TEST_PLAN.md` (manual steps + status); external services behind each feature are in
`costco-backend/EXTERNAL_APIS.md`. Status: ✅ shipped in v1 · ⏸ built but switched off for v1.

### Account

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Email sign-up / sign-in** | Email + password; sign-up confirmed with an 8-digit emailed code (no links — there's no web callback). Unconfirmed accounts get a fresh code on sign-in. | ✅ | §1 |
| **Sign in with Apple** | Native Apple sheet → Supabase. Name prefilled from Apple on first sign-in. | ✅ | §1 |
| **Google sign-in** | Native Google sheet → ID token → Supabase. Name prefilled from Google. | ✅ | §1 |
| **Password reset** | Forgot password? → 8-digit emailed code → new password, all in-app. | ✅ | §1 |
| **Name card** | Optional Home card ("What should we call you?") for accounts with no name; dismissible for good. | ✅ | §1, §18 |
| **Edit Profile** | First/last name and optional phone number. | ✅ | §18 |
| **Account deletion** | Profile → Delete Account (two confirmations) removes the account and every receipt, image, item, alert, check-in, star, and badge. Required by App Review 5.1.1(v). | ✅ | §19 |

### Receipts

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Receipt scan (OCR)** | Camera capture with framing tips → Google Cloud Vision OCR → parsed line items (SKU, description, price, discount, CRV, tax, TC#) → stored per-user. Multi-buys merged by SKU. | ✅ | §2, §3 |
| **Offline queue** | No connection → receipt saved on device, uploaded automatically on reconnect. | ✅ | §4 |
| **Receipt detail** | Items, totals, discounts, full-screen receipt image, Share TC#, inline-editable line items (tap a row to fix an OCR misread), Delete Receipt. Asks once ("Stay in the loop") to turn on notifications, 1.5s after the first receipt opens. | ✅ | §5, §19 |
| **Duplicate detection** | Re-scanning the same receipt returns the existing one instead of a copy; the uploaded image is cleaned up. | ✅ | §3 |
| **Warehouse matching** | Receipt header → warehouse by store number, else postal code, else city; self-heals placeholder `GP-` codes with the real store number. | ✅ | §3, §17 |
| **Manual warehouse picker** | When no warehouse matches, a searchable picker (name, city, address, ZIP) links one by hand. Optional — "Can't find my warehouse" saves without one. | ✅ | §17 |
| **Receipt history** | All receipts with search, warehouse / date-range / amount filters, sort (newest, oldest, highest, lowest), and a month drill-down from Stats. | ✅ | §6, §16 |

### Price drops

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Sliding-window price match** | Every scanned item is watched for 30 days, inline after upload and in a daily 08:00 UTC sweep. Price source: 72h cache → OCR ledger → RapidAPI. | ✅ | §7 |
| **Push alerts** | "Price Drop — you may be owed $X" push, only for new or deeper drops. | ✅ | §8 |
| **Email alerts** | One email per user per run with total savings + "View in Bulkmate" universal link + one-click unsubscribe. On by default; toggle in Profile. | ✅ | §7, §20 |
| **Price Alerts screen** | Active vs. Claimed alerts, "You may be owed" total, days left in the 30-day claim window ("Claim window closing"), Mark as claimed, View Receipt. Opened from Home or the email link. | ✅ | §15 |
| **Weekly text digest** | Friday 3 PM Pacific SMS digest after verifying a phone by SMS code. | ⏸ `SMS_ALERTS_ENABLED=false` | §22 |

### Products

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Barcode / product lookup** | Scan a product or shelf tag → current price, brand, rating, image, plus price history from other members' receipts. Partial result when only ingredient data exists. | ✅ | §9 |
| **Ingredient good/watch/avoid** | NOVA group, Nutri-Score, flagged additives with plain-language reasons (Open Food Facts, USDA fallback). | ✅ | §9 |
| **Barcode history** | Every product looked up, sortable by date or price. | ✅ | §16 |

### Check-ins & game layer

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Geo-fenced check-ins** | Check in when GPS is within 50m of a warehouse; 1 star, once per warehouse per day. | ✅ | §10 |
| **Check-in on receipt scan** | Scanning a receipt also earns a star, dated to the receipt's transaction date; a repeat from the same trip is a silent no-op. | ✅ | §10, §17 |
| **Fan tier progression** | Cumulative stars advance you through 5 named tiers; tier ladder on Profile. | ✅ | §11 |
| **Badge engine** | 10 badges tied to check-in counts, warehouse diversity, warehouse rarity, and tier milestones. | ✅ | §11 |
| **Warehouse rarity** | 723 warehouses tagged Common / Rare / Legendary from Google Places ratings. | ✅ | §11 |
| **Check-in history** | Every visit, sortable by date or stars. | ✅ | §16 |
| **Celebrations** | Checkmark, confetti, halo and star-toss animations on scan and check-in. | ✅ | §10 |

### Home, stats & settings

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Home dashboard** | Greeting, Total Spent / Saved / Receipts, active alert cards, quick actions (Scan, History, Check in). | ✅ | §12 |
| **Unified Recent feed** | Receipts and viewed products in one feed, newest-first under day dividers, with All / Receipts / Viewed chips. | ✅ | §12 |
| **Unified History** | One screen with Receipts / Barcode / Check-ins tabs. | ✅ | §16 |
| **Spend analytics (Stats tab)** | Monthly spend chart (tap a month → its receipts), top items, in-store vs. price-match savings, averages. | ✅ | §13 |
| **Appearance** | Light / Dark / System, persisted on device. | ✅ | §18 |
| **Notification preferences** | Push on/off (with iOS Settings deep link when denied), price-drop emails on/off. | ✅ | §8, §14, §20 |
| **Error fallback** | A themed recovery screen instead of a blank app on a render crash; crashes reported to PostHog. | ✅ | §23 |

### Outside the app

| Feature | What it does | Status | Test |
|---|---|---|---|
| **Universal links** | `https://everyday-labs.org/alerts` opens the app's Alerts screen (web fallback page when the app isn't installed). | ✅ | §20 |
| **Feedback form** | `everyday-labs.org/bulkmate/feedback/` writes to Supabase `feature_requests` (insert-only, no reads). | ✅ | §21 |
| **Privacy policy / support pages** | `everyday-labs.org/bulkmate/privacy/` and `/support/`. | ✅ | §21 |

---

## Decision logic

### Price matching (`price-match-check` Edge Function)

Runs two ways: **inline** right after a receipt upload, and as a **daily 8am `pg_cron` sweep** over all `receipt_items` from the last 30 days.

For each item, current price is resolved through a fallback chain, cheapest/freshest source first:

1. **Cache** — if `products.api_sale_price` was refreshed within the last **72 hours**, reuse it (no API call).
2. **OCR ledger** — median net-paid price (`unit_price - discount_amount`) from *other users'* receipts for that SKU in the last 30 days. Requires **at least 3 data points** to count; free, no external call, gets more reliable as the user base grows.
3. **RapidAPI** (`costco-live-data.p.rapidapi.com`) — live warehouse sale price, paid API call, used when cache and ledger both miss.

The **best current price** = `min(RapidAPI sale price, OCR ledger median)` — whichever source is lower wins, since either could reflect a real markdown.

An alert fires when:
```
delta = net_paid - best_current_price
if delta > $0.01 → create/upsert price_alerts row
  notify (push + email) only if the drop is new, or deeper than the last alert's delta by > $0.01
```
Alerts are keyed by `receipt_item_id` (upsert, so re-checking the same item doesn't duplicate). Each channel has its own stamp (`notified_at` for push, `emailed_at` for email). A repeat finding by the daily sweep keeps those stamps, so it doesn't re-notify; a deeper drop clears them (and any dismissal) so it notifies again. Delivery goes to every channel whose stamp is still empty (and not dismissed), so a run cut off by the time budget, the daily email cap (`ALERT_EMAIL_DAILY_CAP`, default 200) or a provider outage catches up on the next run instead of dropping the notification. Until 2026-10-06 every upsert reset `notified_at`, which would have re-pushed the same drop daily — and the daily sweep itself had never run until `pg_net` was enabled that day.

Push copy example: *"Price Drop — You may be owed $X.XX. [Item] dropped from $Y to $Z. You may qualify for a price adjustment."*

Email: one per user per check, subject *"Price drop: you could get $X back"*, body = total savings across the new drops + a **View in Bulkmate** button (universal link `https://everyday-labs.org/alerts`, opens the app's Alerts screen) + one-click unsubscribe.

### Ingredient classification (`barcode-lookup` Edge Function)

When a scanned/looked-up product resolves to a Costco item, `barcode-lookup` separately tries to resolve its ingredient list and classification by exact-UPC lookup against **Open Food Facts** first (Costco's own pricing API has no ingredient data), falling back to **USDA FoodData Central** only if Open Food Facts has no match. This is enrichment, not part of the primary price lookup — if both fail, the rest of the product detail (price, OCR history) still returns normally and the product screen just doesn't show an ingredients card.

Open Food Facts returns real structured data, not just a raw ingredient string: **NOVA processing group** (1-4, an established food-science classification), **Nutri-Score** (A-E, the real front-of-pack label used in France/EU), the specific **additive E-codes** actually detected in the product, and **high/low nutrient-level flags** computed from its real nutrition facts. Each detected additive is cross-referenced against a curated table (`costco-backend/supabase/functions/_shared/additiveDatabase.ts`, ~25 E-codes with documented regulatory action or research-flagged concern — most additives are deliberately left unflagged):

- **Avoid** — e.g. nitrites/nitrates (E249-252), synthetic dyes (E102/110/122/124/129/133...), BHA/BHT/TBHQ, potassium bromate.
- **Watch** — e.g. MSG (E621), carrageenan (E407), sodium benzoate (E211), artificial sweeteners, plus product-level flags for NOVA 4 (ultra-processed), Nutri-Score D/E, and any nutrient (sugar/salt/fat) running high.
- Everything else is treated as clean.

When Open Food Facts has no match, USDA FDC provides raw ingredient text only (no structured data), classified with a weaker keyword-substring fallback (`classifyByKeyword` in `costco-backend/supabase/functions/_shared/ingredientRules.ts`) — noticeably lower confidence, kept only so a product with no Open Food Facts match still gets *some* signal.

Each flagged item carries a short plain-language reason, shown inline on the product screen alongside NOVA/Nutri-Score badges. The result is cached for 30 days per SKU — far longer than the 72h price cache, since ingredient lists rarely change.

Additive flags are a curated judgment call the team maintains, not a claim of nutritional/medical authority — expect it to be tuned over time. See `costco-backend/EXTERNAL_APIS.md` for the full data-flow and fallback behavior.

### Geo-fenced check-in (`check-in` Edge Function)

1. Load all warehouses, compute Haversine distance from the submitted GPS coords to each.
2. Take the nearest warehouse. If distance > **50 meters**, reject with `too_far` (client never trusted for this — server-side gate only).
3. Insert a `check_ins` row. A unique index (`check_ins_user_warehouse_day`) caps it at **one check-in per warehouse per day** — a repeat same-day check-in returns `already_checked_in: true` and awards nothing.
4. On a new check-in: `total_stars += 1`, tier is recalculated (see below), badges are re-evaluated.

> Note: the check-in radius is **50m**, set by `CHECK_IN_RADIUS_M` in the `check-in` Edge Function. Early planning docs say 150m; that was never what shipped. Code is the source of truth.

### Badge evaluation

Re-run on every successful check-in. A badge is newly awarded if its `trigger_key` condition is satisfied and not already in `user_badges`:

| Trigger key | Condition |
|---|---|
| `first_checkin` | total check-ins ≥ 1 |
| `five_checkins` | total check-ins ≥ 5 |
| `ten_checkins` | total check-ins ≥ 10 |
| `three_warehouses` | distinct warehouses visited ≥ 3 |
| `five_warehouses` | distinct warehouses visited ≥ 5 |
| `rare_warehouse` | this check-in's warehouse tier == `Rare` |
| `legendary_warehouse` | this check-in's warehouse tier == `Legendary` |
| `ten_stars` | total_stars ≥ 10 |
| `gold_star_guru` | fan tier is `GoldStarGuru` or higher |
| `executive_explorer` | fan tier is `ExecutiveExplorer` |

---

## Fan tiers

Tier is derived purely from `total_stars` (1 star per unique warehouse check-in per day), evaluated top-down — the first threshold you meet or exceed wins:

| # | Tier name | Stars required |
|---|---|---|
| 1 | **Kirkland Cadet** | 1+ (starting tier at 0 stars too) |
| 2 | **Wholesale Wanderer** | 3+ |
| 3 | **Bulk Buyer** | 6+ |
| 4 | **Gold Star Guru** | 11+ |
| 5 | **Executive Explorer** | 21+ |

Since 1 check-in = 1 star (and only one counts per warehouse per day), reaching the top tier takes visiting warehouses on 21 separate days.

## Badges (10 total)

| Badge | Icon | Trigger |
|---|---|---|
| First Steps | 👟 | First check-in ever |
| Regular | 🏪 | 5 total check-ins |
| Devoted Member | 💪 | 10 total check-ins |
| Explorer | 🗺 | 3 distinct warehouses visited |
| Warehouse Hopper | ✈️ | 5 distinct warehouses visited |
| Rare Discovery | 💎 | Check in at a Rare-tier warehouse |
| Legendary Visit | 🏆 | Check in at a Legendary-tier warehouse |
| Star Collector | ⭐ | 10 total stars |
| Gold Standard | 🌟 | Reach Gold Star Guru tier |
| Executive | 👑 | Reach Executive Explorer tier |

## Warehouse rarity

Warehouses carry a `tier` of `Common | Rare | Legendary`. **723 warehouses are seeded globally** (511 USA, 74 Canada, 25 Mexico, 24 UK, 21 Japan, 18 South Korea, 16 Australia, plus Taiwan/Spain/France/others), and `tier` is derived from a real signal rather than hand-picked: each location's Google Places rating × log(review count), with the top 5% scoring Legendary, the next 20% Rare, and the rest Common — currently 20 / 129 / 574. Rarity has no effect on check-in mechanics beyond unlocking the `rare_warehouse` / `legendary_warehouse` badges.

---

*Sources: `costco-backend/supabase/functions/check-in/index.ts`, `costco-backend/supabase/functions/price-match-check/index.ts`, `costco-backend/supabase/functions/barcode-lookup/index.ts`, `costco-backend/supabase/migrations/20260626000003_badges_seed.sql`. Verify against those files if this doc and the code ever diverge — the code wins.*
