// ── "Warehouse Red & Cream" palette ─────────────────────────────────────────
// Parallel design system from costco-companion-app-design-system-animation-plan
// (2026-08-04). Not wired into any screen yet — import from here explicitly
// to opt a screen/component into this palette instead of constants/colors.ts.
// Source values: styles.css (Tailwind v4 tokens), ported 1:1 to React Native.

export const WarehouseColorsLight = {
  // Backgrounds
  background: '#fdfaf3',
  cream: '#fdfaf3',
  creamDark: '#f0e6d6',

  // Text / structure
  foreground: '#1b2a4a',
  navy: '#1b2a4a',
  navyLight: '#3d4f75',

  // Primary action / alert
  primary: '#d1373a',
  red: '#d1373a',
  redLight: '#f4d7d7',
  primaryForeground: '#ffffff',

  // Surfaces
  card: '#ffffff',
  cardForeground: '#1b2a4a',
  popover: '#ffffff',
  popoverForeground: '#1b2a4a',
  secondary: '#f5efe6',
  secondaryForeground: '#1b2a4a',
  muted: '#f0e6d6',
  mutedForeground: '#6b7280',
  accent: '#f0e6d6',
  accentForeground: '#1b2a4a',

  // Feedback
  destructive: '#b42318',
  destructiveForeground: '#ffffff',
  success: '#2d8a6e',
  warning: '#d4842a',
  gold: '#c9a84c',

  // Borders / focus
  border: '#e8e0d4',
  input: '#e8e0d4',
  ring: '#d1373a',

  // Charts
  chart1: '#d1373a',
  chart2: '#1b2a4a',
  chart3: '#c9a84c',
  chart4: '#2d8a6e',
  chart5: '#d4842a',
} as const;

export const WarehouseColorsDark = {
  background: '#14121c',
  cream: '#14121c',
  creamDark: '#1f1d28',
  foreground: '#f5efe6',
  navy: '#f5efe6',
  navyLight: '#d8d0c5',

  primary: '#ff6b6d',
  red: '#ff6b6d',
  redLight: '#3d2525',
  primaryForeground: '#14121c',

  card: '#1f1d28',
  cardForeground: '#f5efe6',
  popover: '#1f1d28',
  popoverForeground: '#f5efe6',
  secondary: '#2a2733',
  secondaryForeground: '#f5efe6',
  muted: '#2a2733',
  mutedForeground: '#a8a0a0',
  accent: '#2a2733',
  accentForeground: '#f5efe6',

  destructive: '#ff8a7a',
  destructiveForeground: '#14121c',
  success: '#5cbdb9',
  warning: '#e8b84a',
  gold: '#e8c96e',

  border: 'rgba(245, 239, 230, 0.12)',
  input: 'rgba(245, 239, 230, 0.15)',
  ring: '#ff6b6d',

  chart1: '#ff6b6d',
  chart2: '#a5b4fc',
  chart3: '#e8c96e',
  chart4: '#5cbdb9',
  chart5: '#e8b84a',
} as const;

export type WarehouseColorScheme = typeof WarehouseColorsLight;
