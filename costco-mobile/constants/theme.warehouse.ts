import type { ViewStyle } from 'react-native';
import { spacing } from './theme';

// ── "Warehouse Red & Cream" design tokens ───────────────────────────────────
// Parallel design system from costco-companion-app-design-system-animation-plan
// (2026-08-04). Not wired into any screen yet. Reuses the existing spacing
// scale from ./theme (the plan doesn't redefine spacing), and layers on the
// new radius/typography/shadow/motion tokens from styles.css.

export { spacing };

// ── Typography ────────────────────────────────────────────────────────────────
// Outfit for headings/display, Figtree for body/UI, JetBrains Mono for
// receipt values — load with useWarehouseFonts() from ./fonts.warehouse.
export const fontFamily = {
  display: 'Outfit_700Bold',
  displayMedium: 'Outfit_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemibold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 16,
  xl: 17,
  '2xl': 20,
  '3xl': 22,
  '4xl': 28,
  display: 40,
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────
// Base --radius: 1rem (16px) in styles.css, with sm/md computed as offsets
// and xl/2xl/3xl/4xl computed as additions. Ported directly.
const RADIUS_BASE = 16;

export const radius = {
  sm: RADIUS_BASE - 4,   // 12
  md: RADIUS_BASE - 2,   // 14
  lg: RADIUS_BASE,        // 16
  xl: RADIUS_BASE + 4,   // 20
  '2xl': RADIUS_BASE + 8,  // 24
  '3xl': RADIUS_BASE + 12, // 28
  '4xl': RADIUS_BASE + 16, // 32
  pill: 9999,
} as const;

// ── Elevation / Shadow ────────────────────────────────────────────────────────
// Soft, warm shadows — iOS uses shadow*, Android uses elevation.
type Shadow = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const shadow: Record<'sm' | 'md' | 'lg' | 'xl', Shadow> = {
  sm: {
    shadowColor: '#1b2a4a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1b2a4a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#1b2a4a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  xl: {
    shadowColor: '#1b2a4a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.13,
    shadowRadius: 32,
    elevation: 16,
  },
};

// ── Motion durations ──────────────────────────────────────────────────────────
// Mirrors --duration-* custom properties in styles.css, in ms for Reanimated.
export const duration = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 400,
  celebrate: 600,
} as const;
