// "Warehouse Red & Cream" palette — same token names in light + dark so
// consuming screens never branch on scheme themselves, only the hex values
// underneath change. Dark mode's gray scale is the light scale reversed
// (50<->900, 100<->800, ...) so any code using gray[900] for "darkest text"
// or gray[50] for "lightest surface" inverts correctly without edits.

export const LightColors = {
  // === Brand ===
  costcoRed: '#D1373A',
  costcoRedDark: '#B42318',
  costcoRedLight: '#E2585B',
  executiveNavy: '#1B2A4A',
  executiveNavyDark: '#12203A',
  executiveNavyLight: '#3D4F75',
  goldStarAccent: '#C9A84C',
  goldStarDark: '#A28438', // darkened from #A98A3A: 3:1 on goldStarSubtle chips
  goldStarLight: '#E0C67A',

  // Solid navy fill for opaque decorative blocks (avatars, active pills) that
  // always pair with white text/icons — deliberately the same value in both
  // themes, unlike executiveNavy which inverts for text-on-background use.
  navySolid: '#1B2A4A',
  // Same idea for near-black opaque chips (FAB speed-dial labels, "open" FAB
  // state) — gray[900] would normally serve this, but gray inverts per-theme
  // (see below), which breaks white-on-gray[900] pairings in dark mode.
  darkSolid: '#1A1714',
  // Primary CTA button fill — same lesson as navySolid/darkSolid: dark mode's
  // `costcoRed` brightens to `#FF6B6D` so it reads correctly as *text* on a
  // dark background, but that breaks white-on-costcoRed button fills (caught
  // by `scripts/check-contrast.js`: 2.77:1 in dark mode, needs 4.5:1). Use
  // this for any solid red button/badge background paired with white text.
  costcoRedSolid: '#D1373A',
  // Same idea for the success-color celebration stamp (checkmark circle) —
  // white-on-success also failed contrast in both themes (4.22:1 / 2.70:1).
  successSolid: '#237A5F',

  // === Neutrals ===
  white: '#FFFFFF',
  black: '#0A0A0A',

  // === Brand subtle backgrounds (for icon wells, card accents) ===
  costcoRedSubtle: '#F4D7D7',
  executiveNavySubtle: '#E6EAF1',
  goldStarSubtle: '#F7EED3',

  // === Surfaces (warm cream, not cold) ===
  background: '#FDFAF3', // warehouse cream
  surface: '#FFFFFF',
  surfaceSunken: '#F0E6D6',
  border: '#E8E0D4',
  borderStrong: '#D4C4A8',

  // === Warm Gray Scale ===
  gray: {
    50: '#FAFAF8',
    100: '#F4F2EE',
    200: '#E8E5DF',
    300: '#D4D0C8',
    400: '#958F84', // darkened from #A8A39A: 3:1 muted text on background/surface
    500: '#78726A',
    600: '#57534D',
    700: '#3D3935',
    800: '#292520',
    900: '#1A1714',
  },

  // === Semantic ===
  success: '#2D8A6E',
  successBg: '#E3F3EE',
  successText: '#237A5F', // = successSolid; #2D8A6E was 3.68:1 on successBg
  savings: '#2D8A6E',
  savingsBg: '#E3F3EE',
  warning: '#D4842A',
  warningBg: '#FAECD9',
  warningText: '#8A5219',
  error: '#B42318',
  errorBg: '#FBE4E1',
  info: '#3D4F75',
  infoBg: '#E6EAF1',
};

export const DarkColors: typeof LightColors = {
  // === Brand ===
  costcoRed: '#FF6B6D',
  costcoRedDark: '#B42318',
  costcoRedLight: '#FF9192',
  executiveNavy: '#F0EDE6',
  executiveNavyDark: '#D8D3C7',
  executiveNavyLight: '#B8B2A4',
  goldStarAccent: '#E8C96E',
  goldStarDark: '#C9A84C',
  goldStarLight: '#F0DDA0',

  navySolid: '#1B2A4A',
  darkSolid: '#1A1714',
  costcoRedSolid: '#D1373A',
  successSolid: '#237A5F',

  // === Neutrals ===
  white: '#FFFFFF',
  black: '#0A0A0A',

  // === Brand subtle backgrounds (for icon wells, card accents) ===
  costcoRedSubtle: '#3D2020',
  executiveNavySubtle: '#232A3D',
  goldStarSubtle: '#3A3120',

  // === Surfaces ===
  background: '#17140F',
  surface: '#221E18',
  surfaceSunken: '#2A241C',
  border: '#3A342A',
  borderStrong: '#4D4638',

  // === Warm Gray Scale — light scale reversed ===
  gray: {
    50: '#1A1714',
    100: '#292520',
    200: '#3D3935',
    300: '#57534D',
    400: '#78726A',
    500: '#A8A39A',
    600: '#D4D0C8',
    700: '#E8E5DF',
    800: '#F4F2EE',
    900: '#FAFAF8',
  },

  // === Semantic ===
  success: '#4FAE8E',
  successBg: '#1E3A30',
  successText: '#4FAE8E',
  savings: '#4FAE8E',
  savingsBg: '#1E3A30',
  warning: '#E8A857',
  warningBg: '#3D2E15',
  warningText: '#F0C98A',
  error: '#E8635F',
  errorBg: '#3D1F1C',
  info: '#B8B2A4',
  infoBg: '#232A3D',
};

export type ColorScheme = typeof LightColors;

// Static export kept for any non-reactive/type-reference usage — screens
// that need runtime theme switching should use useThemeColors() from
// ../contexts/ThemeContext instead of importing this directly.
export const Colors = LightColors;
