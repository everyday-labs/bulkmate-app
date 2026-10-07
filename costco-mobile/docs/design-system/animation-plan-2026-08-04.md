> **Status (2026-08-05)**: this plan was executed as an interactive `app/(demo)/` mockup on
> 2026-08-04, then the palette + component patterns were adopted directly into the real app and
> the demo screens were deleted (their job was done — see `CLAUDE.md`'s palette section). For
> further design-system work, including a second reference-app audit and a prioritized backlog,
> see `reference-app-audit-2026-08-05.md` in this same folder.

# Bulkmate — Design System & Animation Plan

*(Written when the app was still called "Costco Companion"; historical plan, titles updated after the rename.)*

## Goal
Create a minimal, clean, quirky design system for the iOS/Android Costco companion app, plus motion/illustration rules that bring the game layer (stars, badges, tiers, warehouse rarity) to life.

## Design Direction (Locked)
- **Palette:** Warehouse Red & Cream — warm cream background `#fdfaf3`, deep navy `#1b2a4a` for text/structure, red `#d1373a` for primary actions and alerts, warm beige `#f0e6d6` for surfaces.
- **Typography:** Playful Geometric — Outfit for headings, Figtree for body.
- **Home layout:** Bento Dashboard — mixed-size tiles for tier, stars, alerts, spend chart.
- **Personality:** Minimal, friendly, slightly gamey. No heavy gradients or generic purple startup aesthetic.

## Deliverables
1. **Design tokens in code** — colors, type, spacing, radius, shadows in `src/styles.css`.
2. **Component starter kit** — Button, Card, Badge, TierPill, StarCounter, AlertTile, ReceiptRow.
3. **Motion system** — entrance/exit timings, micro-interactions (scan success, star pop, tier up), page transitions.
4. **Animated demo screens** — Home dashboard, Receipt scan flow, Badges/Tiers, Price alerts.
5. **Illustration style guide** — simple geometric icons for warehouse rarity, badges, empty states.

## Implementation Steps

### 1. Tokens & Theme
- Map the locked palette to CSS variables and Tailwind v4 `@theme inline` tokens.
- Define semantic colors: `background`, `foreground`, `primary` (red), `accent` (navy), `muted`, `success`, `warning`.
- Set type scale: Outfit headings, Figtree body, mono for receipt values.
- Define spacing/radius/shadows: soft rounded cards, subtle warm shadows.

### 2. Component Library
Build small, reusable components with variants:
- `Button` — primary, secondary, ghost, with press scale.
- `Card` — bento tile variants (featured, compact, alert).
- `StarCounter` — animated star count with pop effect.
- `TierPill` — current fan tier with progress to next.
- `Badge` — unlockable achievement tile.
- `AlertTile` — price-drop notification.
- `ReceiptRow` — scanned item line.

### 3. Motion System
- **Easing:** one custom spring for bouncy moments (stars, badges), one smooth ease for UI transitions.
- **Entrances:** cards fade/slide up with stagger on dashboard load.
- **Micro-interactions:**
  - Scan button: pulse while scanning, checkmark burst on success.
  - Star earn: star scales up, rotates slightly, lands with a tiny shake.
  - Tier up: full-screen confetti-ish burst (lightweight particles), tier badge scales in.
  - Price alert: red badge bounces in.
- **Page transitions:** slide from right, fade on tab switch.

### 4. Demo Screens
Build 4 interactive mock screens with fake data:
- **Home / Dashboard** — bento grid: tier card, star counter, active alerts, spend chart, scan CTA.
- **Scan Receipt** — camera placeholder, scanning state animation, success state with item list.
- **Badges & Tiers** — grid of locked/unlocked badges, tier progression ladder.
- **Price Alerts** — list of recent price drops with savings amount.

### 5. Illustration Style
- Flat geometric shapes, limited palette.
- Warehouse rarity: Common (simple box), Rare (box with star), Legendary (box with crown).
- Badge icons: simple SVG shapes tied to behavior (first scan, streak, rare warehouse).
- Empty states: friendly spot illustrations (e.g. empty receipt, no alerts yet).

## Out of Scope for This Plan
- Backend (OCR, barcode lookup, geofencing, real price data).
- Authentication.
- Native mobile builds — this will be a web-based interactive prototype/screens.

## Success Criteria
- All screens feel cohesive and on-brand.
- Animations are purposeful, not decorative noise.
- Components are reusable and documented in code.
- The app feels easy, fun, and quick to scan a receipt.