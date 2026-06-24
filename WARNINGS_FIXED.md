# Warnings Fixed Log

Track of all warnings, type errors, and lint issues resolved. Each entry records the file, the problem, and the fix applied.

---

## 2026-06-24

### `costco-mobile/app/receipt-success.tsx` — `catch (e: any)` × 2 (strict TypeScript violation)

**Problem:** Two catch blocks typed `e` as `any`:
1. `fetchReceipt` catch: `catch (e: any) { setError(e.message ?? ...) }`
2. `handleDelete` catch: `catch (e: any) { Alert.alert('Error', e.message ?? ...) }`

With `"strict": true` in `tsconfig.json`, TypeScript 4.4+ flags `any` in catch clauses. An `any` type bypasses all type safety, meaning a non-Error thrown value (e.g. a string or number) would silently produce `undefined` instead of a useful message.

**Fix:** Changed both to `catch (e: unknown)` and narrowed with `e instanceof Error ? e.message : 'fallback string'`.

---

### `costco-mobile/app/receipts.tsx` — `catch (e: any)` in `load` (strict TypeScript violation)

**Problem:** `catch (e: any) { setError(e.message ?? ...) }` — same pattern as above.

**Fix:** Changed to `catch (e: unknown)` with `e instanceof Error ? e.message : 'Failed to load receipts'`.

---

### `costco-mobile/app/receipts.tsx` — Stale closure on `displayed` in `load`

**Problem:** `load` is a component-level function called from `useFocusEffect(useCallback(() => load(false), []))`. The empty `[]` deps array means `load` is captured from the first render. Inside `load`, line 85 read:
```typescript
setDisplayed(query.trim() ? displayed : rows);
```
Both `query` and `displayed` were stale closures from the first render (query = `''`, displayed = `[]`). The intent was to preserve search results on refresh, but it never worked — the stale `query` was always `''` so it always set `displayed = rows`, and `displayed` pointed to the initial empty array anyway.

**Fix:** Removed the `setDisplayed` call from `load` entirely. The existing `useEffect([query, allReceipts, runSearch])` already handles this correctly: when `allReceipts` is updated by `load`, the effect re-runs and either resets `displayed` to all receipts (empty query) or re-executes `runSearch` (active query), always using fresh state values.

---

### `costco-mobile/app/receipts.tsx` — `runSearch` missing from `useEffect` deps

**Problem:** `runSearch` was called inside the debounce `useEffect` but omitted from its dependency array `[query, allReceipts]`. The `react-hooks/exhaustive-deps` rule flags this as a potential bug because if `runSearch` closed over stale values it would silently produce wrong results.

**Fix:** Wrapped `runSearch` in `useCallback(async (q, receipts) => { ... }, [])`. Since `runSearch` receives all its inputs as explicit parameters (`q` and `receipts`) and only uses stable references (`supabase`, `setSearching`, `setDisplayed`), the deps array is empty. Added `runSearch` to the `useEffect` deps: `[query, allReceipts, runSearch]`.

---

### `costco-mobile/app/_layout.tsx` — `router` missing from `useEffect` deps

**Problem:** The auth-guard `useEffect` used `router.replace(...)` but `router` was not listed in `[session, loading, segments]`. The `react-hooks/exhaustive-deps` rule flags this.

**Fix:** Added `router` to the deps array: `[session, loading, segments, router]`. `useRouter()` in Expo Router returns a stable reference so this does not cause any extra re-runs.

---

### `costco-backend/supabase/functions/ingest-receipt/parser.ts` — Fallback SKU regex used `{5,9}` instead of `{4,9}`

**Problem:** The fallback item-section start detection (used when no Member line is found) used:
```typescript
if (/^[A-Z]?[0-9]{5,9}(\s|$)/.test(lines[i])) {
```
All other SKU patterns in the same file were updated to `{4,9}` (Sprint 3 fix for 4-digit SKUs like `7812 YELLOW ONION`), but this fallback was missed. On self-checkout receipts with no Member line and a 4-digit SKU as the first item, the fallback would fail to find `itemStart`, returning an empty item array.

**Fix:** Changed `{5,9}` to `{4,9}` to match the rest of the parser.

---
