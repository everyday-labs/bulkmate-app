import type { ViewStyle } from 'react-native';

// ── Spacing ───────────────────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

// ── Typography ────────────────────────────────────────────────────────────────
export const fontSize = {
  xs: 11, // metadata labels, caps
  sm: 13, // secondary / caption
  md: 15, // body (default)
  lg: 16, // inputs, buttons
  xl: 17, // nav titles
  '2xl': 20, // sheet / modal headings
  '3xl': 22, // screen titles
  '4xl': 28, // display headings
  display: 40, // brand / logo
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

export const letterSpacing = {
  tight: -0.4,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  caps: 1.2, // for ALL-CAPS labels
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 16,
  '3xl': 20,
  pill: 9999,
} as const;

// ── Elevation / Shadow ────────────────────────────────────────────────────────
// All props coexist — iOS uses shadow*, Android uses elevation.
type Shadow = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const shadow: Record<'sm' | 'md' | 'lg' | 'xl', Shadow> = {
  sm: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1714',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 5,
  },
  lg: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.11,
    shadowRadius: 20,
    elevation: 10,
  },
  xl: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 16,
  },
};
