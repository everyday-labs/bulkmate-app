# Reference App Audit — "Costco Quest" (Lovable) — 2026-08-05

## Source

A screen recording (`Screen Recording 2026-08-05 at 11.46.29 AM.mov`, 65s) of the user's
Lovable.dev session on the original **"Costco Quest"** reference web app — the same project
that lives locally at `~/Downloads/Costco quest` and that the "Warehouse Red & Cream" palette
(`costco-mobile/constants/colors.ts`) and the animation plan
(`animation-plan-2026-08-04.md`) were both sourced from. The recording showed two AI-assisted
fixes (a dark-mode contrast validation check, a FAB phantom-drag bug fix) while the live preview
cycled through Home → Badges → Alerts → the unified Scan screen (Receipt/Barcode/Check-in).

Reviewed by extracting frames every 2s with `ffmpeg` (no audio/motion playback) — confidence on
*static layout and copy* is high; confidence on exact animation *timing/easing* comes from
reading the reference app's actual source (`~/Downloads/Costco quest/src/`), not the video.

## Status key
- ✅ **Ported** — already built into the real app (`costco-mobile/app/`, not the demo mockups)
- 🔲 **Not yet ported** — a real gap, candidate for future work

---

## Scan / Check-in flows

1. 🔲 **One unified Scan screen with a 3-way mode switcher** (Receipt / Barcode / Check-in tabs
   at the top), replacing three separate screens (`receipt-camera.tsx`, `product-scan.tsx`, and
   the Home-tab check-in quick action). Would let viewfinder chrome/animations be shared code
   instead of triplicated.
2. 🔲 **Per-mode instructional empty states** — 3 numbered coaching tips instead of one line:
   - Check-in: "Turn on location → Stand within 150m → Tap confirm to bank your stars"
   - Barcode: "Center the barcode in the frame → Avoid glare from warehouse lights → Works on shelf tags too"
   - Receipt: "Flatten the receipt on a dark surface → Fit the whole receipt inside the frame → Hold still until the sweep finishes"
3. 🔲 **Check-in card shows the warehouse's rarity chip inline** ("Rare"/"Legendary") next to its
   name/city, plus the distance requirement stated as body copy *before* the user even taps —
   ours only surfaces this after a failed attempt (the "too far" modal).
4. 🔲 **Explicit GPS distance readout on success** — "Checked in! · verified 84m from center".
   Ours shows stars/tier but not the actual verified distance.
5. 🔲 **Receipt scan success state includes a quality signal** — "4 items read · nice haul".

## Alerts screen

6. 🔲 **Active vs. Claimed split** — claimed/dismissed alerts move to their own labeled section
   with an icon showing how they were claimed, instead of disappearing. Ours removes dismissed
   alerts from the list entirely (`app/(tabs)/index.tsx` `dismissAlert`).
7. 🔲 **Days-left-to-claim countdown per alert** ("18 days left to claim") — urgency framing;
   ours shows the dollar delta only.
8. 🔲 **Total potential savings hero card** restated at the top of the dedicated Alerts screen
   (we don't have a dedicated Alerts screen at all yet — alerts only appear as cards on Home).
9. 🔲 **Per-item "Mark for price adjustment" CTA button** on each alert card, rather than a small
   ✕ dismiss icon — makes the primary action more prominent than the secondary one.

## Badges & Tiers

10. 🔲 **Tier ladder as a persistent progress list** — all 5 tiers shown with checkmarks/stars for
    reached ones. Profile (`app/(tabs)/profile.tsx`) currently only shows the *current* tier.
11. 🔲 **Achievement grid with named rarity tiers per badge** ("Rare Find", "Legendary Trip",
    "Savings Hoarder") rather than a flat unlocked/locked grid.

## Home dashboard

12. 🔲 **"Last check-in" stat card** — warehouse name + rarity chip as a glanceable top-row stat
    tile, alongside Total Spent/Saved/Receipts.

## Animation & illustration details

✅ **Already ported** (`components/ScanEffects.tsx`, wired into `receipt-camera.tsx` and the
Home tab's `CheckInModal`):
- Drawn checkmark — SVG stroke draws itself in
- Confetti burst — 12 pieces radiating out on success
- Expanding ring halo — two rings pulsing outward from the success badge
- Star toss — bouncy rotate-in entrance, staggered
- Wobble/shake — scan failure feedback
- Corner-bracket pulse + sweep line on the scan viewfinder

🔲 **Not yet ported**:
13. **"Stamp" bounce-in on the success badge itself** — the circle punches in with an exaggerated
    scale/rotate bounce (oversized + rotated → slight overshoot → settle) *before* the checkmark
    draws inside it. Ours currently has the checkmark draw but the badge circle just appears.
14. **Multiple stars tossed in sequence** — reference animates *each individual star icon* when a
    check-in awards more than one star, staggered. We only apply star-toss to the two stat
    numbers (+1 earned / total), not to individual star glyphs.
15. **Sparkle/twinkle glint** — small rotating/scaling sparkle particles for Legendary-tier badges
    or rare warehouse icons.
16. **Shimmer sweep** — diagonal light band, typically for loading/skeleton states or a "shine
    pass" over gold/legendary elements.
17. **Gentle idle float on empty-state icons** — slow up-down bob (e.g. the 🧾 on "No receipts
    yet"). We *had* this (`FloatView` in the old `components/warehouse/WarehouseMotion.tsx`) but
    it was deleted along with the rest of `components/warehouse/` when the design-system mockup
    screens (`app/(demo)/`) were removed on 2026-08-05. It was a generic, reusable primitive, not
    mockup-specific — worth recreating directly in a real shared-components location if wanted.

## Tooling idea (not UI)

18. **Automated dark-mode contrast validation** (reference's `npm run check:contrast`, a scripted
    WCAG pass/fail per color-token pairing). This is exactly what would have caught the two real
    dark-mode contrast bugs found and fixed by hand this session (see below) — worth setting up
    as an actual lint step rather than relying on manual screenshot review.

---

## Bugs found & fixed this session (context for future dark-mode work)

Root cause both times: `constants/colors.ts`'s dark palette **reverses the gray scale** (`gray[900]`
light → `gray[50]`-equivalent dark, etc.) and inverts a few brand tokens (`executiveNavy`) so they
read correctly as *text* in dark mode. That inversion silently breaks any place that reused those
same tokens as an **opaque solid-fill background** paired with hardcoded white text/icons — the
background goes light while the text stays white.

- Fixed via a new `navySolid` token (`#1B2A4A`, fixed in both themes): profile avatar circle,
  "About" avatar circle, Appearance toggle's active pill, receipt-success "Share" button.
- Fixed via a new `darkSolid` token (`#1A1714`, fixed in both themes): `ScanFAB`'s speed-dial
  option-label pills, the FAB's "open" state background.
- **Lesson for future work**: any *new* opaque decorative fill (badge circles, chips, pills) that
  pairs with hardcoded `Colors.white` or `Colors.black` must use `navySolid`/`darkSolid` (or a new
  purpose-built non-inverting token), never `executiveNavy*` or `gray[700+]` directly.

## Suggested priority order

1. Items #1–3 (unified Scan screen + per-mode coaching) — user-flagged as most wanted.
2. Items #6–9 (dedicated Alerts screen + claimed history + urgency framing).
3. Item #13 (stamp bounce-in) — cheap upgrade to an already-built celebration.
4. Item #18 (contrast-check tooling) — prevents repeating the bugs above.
5. Items #10–12, #14–17 — lower urgency, revisit after the above land.
