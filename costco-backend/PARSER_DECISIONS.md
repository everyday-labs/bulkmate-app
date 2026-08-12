# Receipt Parser — Decision Log

Track of every logic change made to `supabase/functions/ingest-receipt/parser.ts`, the OCR receipt that triggered it, and the reasoning. Use this before making further changes.

---

## Architecture Decision: Two-Pass Zip (Sprint 2)

**Problem:** Costco self-checkout OCR reads receipts in column order, not row order. A state machine expecting item-then-price per line produces wrong results when OCR delivers:

```
items 1–3   ← left column batch
prices 1–3  ← right column batch
items 4–5   ← left column batch
prices 4–5  ← right column batch
```

A state machine entering "multiline name" mode on item 1 would swallow items 2 and 3 as continuations of item 1's description.

**Decision:** Two-pass zip.
- Pass 1: scan every line in document order, classify into `skuEntries[]` (with or without inline price) and `prices[]` (standalone).
- Pass 2: zip — each SKU without an inline price consumes the next standalone price in sequence.

**Why this works across all observed formats:**
- Interleaved (item → price → item → price): SKUs and prices stay in relative order → zip produces correct pairs.
- Batched (all items → all prices): same — zip pairs them correctly.
- Partial-batch (mixed groups): same.

**Reference:** `CostcoWrapped` open-source project (GonzaloZiadi) was reviewed but used a state machine that did not handle partial-batch layout. Two-pass zip was written from scratch.

---

## Change Log

### 2026-06 — Sprint 2 initial: 5-digit SKU minimum
**Receipt:** First 5-item receipt (warehouse #401).  
**Pattern:** `skuOnly = /^([A-Z]?[0-9]{5,9})(?:\s+(.*))?$/`  
**Reason:** All observed Costco SKUs at the time had 5+ digits.

---

### 2026-06 — Sprint 2: Subtotal leaking into prices
**Problem:** The SUBTOTAL dollar amount (e.g. `48.75`) appeared as a standalone price line and was consumed by the zip, producing one extra item or inflating a price.  
**Three-layer fix applied:**
1. Robust SUBTOTAL boundary: `/^SUB[\s-]?TOTAL|^\*+\s*TOTAL/i` terminates the item section.
2. `aggregateLinePattern` guard inside the item pass skips any aggregate lines that slip through.
3. `cappedPrices = prices.slice(0, skuEntries.length)` — any extra standalone prices (subtotal, tax) can never be zipped with an item.

---

### 2026-06 — Sprint 2: Member line variants
**Problem:** OCR sometimes produces `39 Member 112051125767` or `59 Member 112051 25767` (prefix digit before "Member"). The section start detection used an exact match and missed these.  
**Fix:** `/Member/i` test — prefix digits are ignored. The start index accounts for whether the member number is on the same line or the next.

**Fallback:** Some self-checkout receipts have no Member line at all. Added fallback: if no Member line found, `itemStart` is set to the first line matching `/^[A-Z]?[0-9]{4,9}(\s|$)/` (first SKU-like line).

---

### 2026-06 — Sprint 2: Expected item count extraction
**Problem:** `TOTAL NUMBER OF ITEMS SOLD` line was not being found. Actual Costco format uses a dash (`- 5`), not equals (`= 5`).  
**Fix:** `/TOTAL\s+NUMBER\s+OF\s+ITEMS\s+SOLD\s*[-=]\s*(\d+)/i` — accepts both.  
Also added two secondary patterns:
- `4 Items Sold` → `/(\d+)\s+Items?\s+Sold/i`
- `Items Sold: 5` → `/Items?\s+Sold\s*:?\s*(\d+)/i`

---

### 2026-06 — Sprint 2: Deduplication removed
**Problem:** A deduplication step was removing items with the same SKU, assuming they were OCR duplicates. But a user can legitimately buy two units of the same item (two boxes of Kirkland Mixed Nuts = two receipt lines with the same SKU).  
**Fix:** Removed deduplication entirely. The item count mismatch warning (`ITEM COUNT MISMATCH`) now serves as the OCR duplicate detector — if parsed count ≠ stated count, the log will show it and the raw OCR text is stored for inspection.

---

### 2026-06 — Sprint 3: 11-item receipt producing only 3 items

**Receipt OCR summary:** 11-item receipt, warehouse #401, includes produce, CRV beverages, and tax-exempt items.

**Root cause 1 — Tax code suffix on price lines**  
Costco prints a tax code letter after each price: `A` (taxable), `E` (food/exempt), `F` (FSA-eligible).  
OCR produces lines like `24.99 A` or `9.99 E`.  
Old `standalonePrice` pattern `/^(\d{1,3}\.\d{2})$/` required no trailing characters → all tax-coded prices were silently dropped.  
**Fix:** `/^(\d*\.\d{2})\s*[A-Z]?\s*$/` — trailing letter + surrounding whitespace optional.

**Root cause 2 — Tax code suffix on savings lines**  
Instant savings appear as `3.00-` on most receipts, but some have `3.00-A` (tax code appended).  
Old `savingsLine` pattern `/^(\d{1,3}\.\d{2})-$/` failed to match.  
**Fix:** `/^(\d{1,3}\.\d{2})-\s*[A-Z]?\s*$/`

**Root cause 3 — 4-digit SKU**  
Item `7812 YELLOW ONION` has a 4-digit SKU. Old patterns required `{5,9}` digits.  
**Fix:** Changed all SKU patterns to `{4,9}`.  
Risk: 4-digit numbers elsewhere (years, quantities) could be misclassified. Mitigated by section boundary: only lines between Member and SUBTOTAL are processed, which limits false positives.

**Root cause 4 — OCR-dropped leading digit on sub-$1 price**  
Price `7.99` was OCR-read as `.99` (leading `7` dropped). Old `standalonePrice` required `\d{1,3}` (at least one digit before the decimal).  
**Fix:** Changed to `\d*` (zero or more leading digits).  
Implication: `.99` is captured as `$0.99` — technically wrong (true value was `$7.99`). This is unavoidable without total-verification logic (see Future Improvements).

**Root cause 5 — CRV price consuming a zip slot**  
CRV (California Redemption Value) barcodes (`0600000000 CA REDEMP V`) are correctly filtered by `couponPattern`. But the associated CRV price (`0.30`) appeared on the next standalone price line and was incorrectly consumed by the zip, shifting all subsequent prices by one.  
Old mitigation (price ≥ $1.00 threshold) was removed when we added `.99` price support.  
**Fix:** One-shot `skipNextPrice` flag. When a line matching `couponPattern` also matches `/REDEMP/i`, the flag is set. The next standalone price line is skipped, the flag resets. This precisely targets the CRV price without affecting any other sub-$1 prices.

---

### 2026-06 — Sprint 3: total_amount mismatch

**Problem:** `total_amount` stored in `receipts` table did not match the receipt's printed total. Two bugs:
1. `total_amount` was `sum(unitPrice)` — did not subtract `discountAmount`.
2. OCR digit-drop errors (`.99` parsed as `$0.99` instead of `$7.99`) made the computed sum incorrect.

**Fix:** Added `extractSubtotal()` to parser, which reads the `SUBTOTAL NNN.NN` line directly off the receipt.  
`total_amount` now uses `parsed.subtotal` (the printed value) as the primary source.  
Falls back to `sum(unitPrice - discountAmount)` only if the SUBTOTAL line was not found in OCR.

**PRICE SUM MISMATCH warning** added to `index.ts`: if computed total differs from receipt subtotal by > $0.02, logs a warning. This is the primary signal that OCR digit-drops are present in the items.

**Note:** Costco's SUBTOTAL line is pre-tax. The `total_amount` column therefore stores the pre-tax subtotal, not the final charge. Tax is not parsed.

---

### 2026-06 — Sprint 4: savings lost on inline-price items + subtotal display wrong

**Problem:** Subtotal shown in the receipt view did not match the physical receipt.

**Root cause 1 — Parser: savings dropped for inline-price items**
When an item is on one OCR line (`1234567 KIRKLAND CHEESE 12.99 A`) it is matched by `skuWithPrice` and pushed to `skuEntries` with `inlinePrice: 12.99` and `discountAmount: 0`. If a savings line (`2.00-`) follows, the handler did:
```
savingsMap.set(prices.length - 1, amount)   // prices.length = 0 → index -1 → never retrieved
```
The discount was silently lost. `discountAmount` stayed 0 for that item.

**Fix:** Added `discountAmount: number` field to `SkuEntry`. When a savings line is encountered and `prices.length === 0`, the discount is applied directly to `skuEntries[last].discountAmount` instead. This is threaded through to the final `ParsedItem` in the zip pass.

**Root cause 2 — Display: subtotal used stale DB value**
`receipt.total_amount` in the DB was used as the subtotal. For receipts scanned before the `total_amount` fix (Sprint 3), the stored value was `sum(unit_price)` with no discounts subtracted — which is higher than the actual subtotal.

**Fix:** Display now always computes `subtotal = itemTotal - totalSavings` from the loaded items. This is self-consistent with the "Item total" and "Instant savings" lines shown above it. `receipt.total_amount` (the OCR-captured SUBTOTAL line) is used only as the base for the grand total, where it's more reliable than the item-level computation.

**Root cause 3 — Extraction regex: `$` prefix not handled**
`extractSubtotal`, `extractTax`, and `extractGrandTotal` didn't handle amounts printed with a leading `$` sign (e.g. `SUBTOTAL $48.75`). Also `extractTax` didn't handle the amount appearing on the next line.

**Fix:** Added `\$?` before the digit group in all three functions. Added next-line fallback to `extractTax`.

**Receipt number extraction broadened:**
`extractTransactionNumber` now also handles:
- Dashes in TC# (`TC# 1234-5678-9012`)
- TC# split across two OCR lines
- Standalone 10–20 digit barcode number appearing after the `** TOTAL` line (the number printed below the bottom barcode, which may not have a `TC#` label)

---

## Known OCR Format Variants (observed in the wild)

| Format | Example | Handled? |
|--------|---------|----------|
| SKU + description + inline price | `1061247 KIRKLAND PARM 12.99 A` | Yes — `skuWithPrice` |
| SKU + description (price on separate line) | `7812 YELLOW ONION` then `2.49 E` | Yes — two-pass zip |
| Price with tax code | `24.99 A`, `9.99 E`, `14.99 F` | Yes |
| Instant savings | `3.00-`, `3.00-A` | Yes |
| CRV barcode | `0600000000 CA REDEMP V` | Yes — `couponPattern` |
| CRV price line | `0.30` after CRV barcode | Yes — `skipNextPrice` |
| Member line variants | `59 Member 112051125767`, `EX Member XXXXX` | Yes |
| No Member line (self-checkout) | Falls back to first SKU | Yes |
| SUBTOTAL variants | `SUBTOTAL`, `SUB TOTAL`, `SUB-TOTAL`, `*** TOTAL` | Yes |
| Total items count | `TOTAL NUMBER OF ITEMS SOLD - 5`, `Items Sold: 5` | Yes |
| Sub-$1 price with dropped digit | `.99` (should be `7.99`) | Captured as `$0.99` — known inaccuracy |
| BOB (Bottom of Basket) | `***BOB***` | Filtered by `aggregateLinePattern` |

---

## Future Improvements

### Total verification
After zipping items, sum all `unitPrice` values and compare to SUBTOTAL extracted from the receipt. If the delta is a round number (e.g. off by $7.00), it likely indicates a leading digit was dropped by OCR (`.99` → should be `7.99`). Flag a `priceSumMismatch` warning and store for inspection.

### Multi-quantity lines
Some Costco receipts use `2 @ 3.99` format for multi-unit purchases. Not yet observed in OCR output. If encountered, add a quantity multiplier parse step in Pass 1.

### Regex-based BOB detection
`***BOB*** 0.00` lines may vary. Current `aggregateLinePattern` catches `\*{2,}` which covers this, but confirm if BOB ever appears without asterisks.

### Warehouse code from receipt header
Currently extracted from any line matching `#NNN` or `WAREHOUSE NNN`. Some receipts may use a different format. If warehouse is frequently `null`, inspect `ocr_raw` for the store identifier pattern.

---

## Warehouse resolution — postal-code/city fallback + self-healing warehouse_code (2026-08-09)

**Not a parser.ts change** — this lives in `ingest-receipt/index.ts`'s warehouse-resolution step, not the pure text parser, since it needs DB access. Documented here because it depends directly on `parsed.warehouseCode`.

**Problem:** `scripts/seed-warehouses-from-google-places.mjs` seeded global warehouses with synthetic `GP-######` codes (Google Places has no concept of Costco's real internal store number). The existing exact `.eq('warehouse_code', parsed.warehouseCode)` lookup will never match any of them, even though the receipt itself has the real code.

**Fix — `matchWarehouseByReceiptHeader()`:** when the exact-code lookup misses, check the first ~12 lines of the receipt's OCR text (the header region, before the item section) against every `GP-`-coded warehouse's **postal code first, city name second**. Postal code is preferred and tried first — a city can have more than one Costco, so city-name-only matching is ambiguous in exactly the way a postal code isn't. City is a second-tier fallback for receipts that don't clearly show a postal code. Either tier: exactly one match → link the receipt and overwrite that warehouse's placeholder code with the real `parsed.warehouseCode` just parsed. Zero or multiple matches at a tier → don't guess, fall through (city) or leave unlinked (neither matched).

**Why restricted to the header region, not the whole receipt:** searching the full OCR text risks a false hit — a 5-digit postal code can coincidentally appear as a substring inside a long, unrelated barcode/transaction-number digit run further down the receipt (`extractTransactionNumber`'s barcode fallback matches 10–20 digit strings). The postal-code regex also uses `\b` word-boundary anchors for the same reason, and treats internal whitespace as `\s*` so OCR variants like split-across-lines or dropped spaces ("K2G 5W5" / "K2G5W5" / "K2G\n5W5") still match.

**Self-healing, not a one-time fix:** the first receipt scanned at any given warehouse corrects that warehouse's row permanently — every later receipt from the same physical warehouse (same real code printed on it) hits the fast exact-match path with no fallback needed. No manual per-row correction required, at the cost of the first scan at each warehouse being unlinked-then-corrected rather than linked immediately.

**Not yet live-verified** — untested against a real non-Bay-Area receipt. Before trusting this at scale, scan a real receipt from a `GP-`-coded warehouse and confirm in the Supabase dashboard that (a) the receipt links to the right warehouse row and (b) that row's `warehouse_code` gets overwritten with the real value, not left as `GP-######`.
