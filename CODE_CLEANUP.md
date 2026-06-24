# Code Cleanup Log

Track of all unused code removed from the codebase. Each entry records the file, what was removed, and why.

---

## 2026-06-24

### `costco-mobile/app/receipt-success.tsx` — Remove unused `Animated` import

**Removed:** `Animated` from the `react-native` import block (line 12 before fix).

**Why:** `Animated` was imported but never referenced anywhere in the file. It was likely carried over from an earlier iteration of the screen that planned to use an animation for the success checkmark.

---

### `costco-mobile/app/receipt-success.tsx` — Remove `quantity` from `ReceiptItem` type and Supabase query

**Removed:**
- `quantity: number` field from the `ReceiptItem` type.
- `quantity` from the `.select('id, sku, description, unit_price, discount_amount, quantity')` query on `receipt_items`.

**Why:** `quantity` was fetched from the database and typed, but never used in the render output. The receipt detail view shows SKU, description, unit price, and discount — no quantity column is displayed. Fetching it added an unnecessary column to every receipt detail load.

---
