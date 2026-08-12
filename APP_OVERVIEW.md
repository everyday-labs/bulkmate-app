# App Overview — Bulkmate

*(Renamed from "Costco Companion" before beta distribution — see the README's naming note.)*

A gamified, open-source Costco membership companion app (iOS/Android, mobile-only for v1). It turns the boring parts of being a Costco member — tracking receipts, catching price drops, remembering which warehouse you visited — into something closer to a collection game. Not affiliated with Costco.

---

## Elevator pitch

Scan your receipt and the app quietly does two useful things: it logs everything you bought, and it watches for 30 days afterward to see if the price drops — so you know when to walk back in and ask for a price adjustment. On top of that utility layer sits a game layer: checking in at a warehouse (GPS-verified) earns stars, stars level you up through five fan tiers, and milestones unlock badges.

---

## Features

| Feature | What it does |
|---|---|
| **Receipt OCR ingestion** | Camera capture → Google Cloud Vision OCR → parsed line items (SKU, description, unit price, discount) → stored per-user. Works offline; queued scans drain once back online. Line items are inline-editable after the fact (tap a row on the receipt-success screen) to fix an OCR misread. |
| **Sliding-window price match** | Every scanned item is watched for 30 days. If the price drops, you get a push notification telling you the refund you may be owed. |
| **Barcode / product lookup** | Scan any product in-store to pull its current price, brand, and rating — plus, where available, a good/watch/avoid ingredient breakdown. |
| **Geo-fenced check-ins** | Check in at a warehouse when your GPS is within range; earns 1 star, capped at once per warehouse per day. |
| **Check-in on receipt scan** | Scanning a receipt also earns a star — a receipt is proof you were there. Dated to the receipt's transaction date, not the upload date, and a repeat from the same trip is a silent no-op. |
| **Manual warehouse picker** | When a receipt header can't be matched to a known warehouse, a searchable picker lets you pick it by name, city, or ZIP. Optional — the receipt saves either way. |
| **Account deletion** | Profile → Delete Account removes the account and every receipt, image, item, alert, check-in, star, and badge. |
| **Fan tier progression** | Cumulative stars advance you through 5 named tiers. |
| **Badge engine** | 10 badges tied to check-in counts, warehouse diversity, warehouse rarity, and tier milestones. |
| **Spend analytics dashboard** | Monthly spend, top items by cost, in-store vs. price-match savings breakdown. |
| **Warehouse rarity** | Each warehouse is tagged Common / Rare / Legendary, adding a collectible angle to visiting different locations. |
| **Unified Recent feed** | Home screen shows receipts and viewed products together in one feed, sorted newest-first and grouped under day dividers (Today / Yesterday / N days ago), with All / Receipts / Viewed filter chips. |

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
if delta > $0.01 → create/upsert price_alerts row, queue push notification
```
Alerts are keyed by `receipt_item_id` (upsert, so re-checking the same item doesn't duplicate). Once a push is sent, `notified_at` is stamped so the daily sweep won't re-notify for the same alert.

Push copy example: *"Price Drop — You may be owed $X.XX. [Item] dropped from $Y to $Z. You may qualify for a price adjustment."*

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
