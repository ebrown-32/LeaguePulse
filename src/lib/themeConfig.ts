/**
 * Theme types and constants. Safe to import on both client and server.
 * Actual storage functions live in themeStorage.ts (server-only).
 */

export type FontPairKey =
  | 'bricolage-dm' | 'syne-dm'     | 'fraunces-outfit' | 'outfit'
  | 'anton-inter'  | 'bebas-inter' | 'oswald-roboto'
  | 'space-inter'  | 'playfair-source' | 'unbounded-dm' | 'instrument-inter'
  | 'archivo-inter'| 'chakra-inter'    | 'sora-inter'   | 'dmserif-dm'
  | 'rubikmono-inter' | 'teko-inter'   | 'familjen-inter' | 'baskerville-inter';

export type BackgroundStyle = 'grid' | 'particles' | 'plain';
export type MotionLevel = 'full' | 'reduced';

export type PaletteKey =
  | 'prussian' | 'harbor'    | 'ensign'  | 'midnight'
  | 'carbon'   | 'evergreen' | 'oxblood' | 'sunset'
  | 'mocha'    | 'porcelain' | 'nord'    | 'synthwave'
  | 'ember'    | 'ultraviolet' | 'copper' | 'sakura'
  | 'gridiron' | 'slate'     | 'goldenrod' | 'tidal'
  | 'crimson'  | 'linen';

/**
 * A full surface ramp, not just an accent. Every value is a bare HSL triplet
 * ("221 51% 16%") so it drops straight into the `hsl(var(--token))` pattern
 * the whole app already uses.
 *
 * Accent hue/saturation stays a separate, independently overridable setting —
 * a palette ships a default accent, but the admin can still recolour it
 * without losing the surface ramp.
 */
export interface SurfaceTokens {
  background:         string;
  foreground:         string;
  card:               string;
  cardForeground:     string;
  popover:            string;
  popoverForeground:  string;
  secondary:          string;
  secondaryForeground:string;
  muted:              string;
  mutedForeground:    string;
  accent:             string;
  accentForeground:   string;
  border:             string;
  input:              string;
  primaryForeground:  string;
}

export interface PaletteDefinition {
  name:        string;
  description: string;
  /** The palette's full colour set, shown as a strip in the admin picker:
   *  [ground, surface, accent, secondary accent, text]. Five, not four —
   *  the secondary accent is what the transaction tags are built from, so
   *  truncating it hid a colour the theme actually uses. */
  swatches:    string[];
  dark:        SurfaceTokens;
  light:       SurfaceTokens;
  /** Default accent for this palette; overridable via the accent picker. */
  accentDark:  { h: number; s: number; l: number };
  accentLight: { h: number; s: number; l: number };
  /** Trade / waiver / free-agent tag colours drawn from this palette's own
   *  hues, so transaction tags read as part of the theme instead of a fixed
   *  set that clashes with it. Still overridable in the admin panel. */
  txDark:      TxColors;
  txLight:     TxColors;
}

export interface TxColors {
  trade:     string;  // hex
  waiver:    string;
  freeAgent: string;
}

export interface ThemeConfig {
  palette:       PaletteKey;  // full surface ramp (backgrounds, borders, text)
  primaryH:      number;      // dark mode accent hue 0–360
  primaryS:      number;      // dark mode accent saturation 0–100 (%)
  primaryL:      number;      // dark mode accent lightness 0–100 (%)
  primaryHLight: number;      // light mode accent hue
  primarySLight: number;      // light mode accent saturation
  primaryLLight: number;      // light mode accent lightness
  radiusRem:     number;      // e.g. 0, 0.25, 0.5, 0.75, 1
  fontPair:      FontPairKey;
  background:    BackgroundStyle; // ambient grid behind content, or nothing
  motion:        MotionLevel;     // page transitions + ambient drift
  logoUrl:       string | null;
  leagueName:    string | null;
  /** Browser tab icon. Falls back to the logo, then to the bundled default. */
  /** Audible click on interaction. Off by default: unexpected sound from a
   *  website is worse than no sound, so a league opts in. */
  sound:         'on' | 'off';
  /** Vibration on interaction, where the device supports it. */
  haptics:       'on' | 'off';
  faviconUrl:    string | null;
  /** Browser tab and share title. Falls back to the league name. */
  siteTitle:     string | null;
  /** Share and search description. */
  siteDescription: string | null;
  txColorsDark:  TxColors;
  txColorsLight: TxColors;
}

export const DEFAULT_TX_DARK: TxColors = {
  trade:     '#f59e0b',
  waiver:    '#38bdf8',
  freeAgent: '#34d399',
};

export const DEFAULT_TX_LIGHT: TxColors = {
  trade:     '#d97706',
  waiver:    '#0284c7',
  freeAgent: '#059669',
};

/**
 * Full surface ramps. "prussian" is the house palette — pure black ground,
 * Prussian-blue surfaces, amber-orange accent, alabaster text.
 */
export const palettes: Record<PaletteKey, PaletteDefinition> = {
  prussian: {
    name:        'Prussian',
    description: 'Black ground, deep blue surfaces, amber accent',
    swatches:    ['#000000', '#14213d', '#fca311', '#e5e5e5', '#ffffff'],
    accentDark:  { h: 37, s: 98, l: 53 },
    accentLight: { h: 37, s: 98, l: 42 },
    // Amber signature, a lifted Prussian blue, and a cool platinum.
    txDark:      { trade: '#fca311', waiver: '#6f9ceb', freeAgent: '#cbd5e1' },
    txLight:     { trade: '#b26a02', waiver: '#29447e', freeAgent: '#64748b' },
    dark: {
      background: '0 0% 0%', foreground: '0 0% 92%',
      card: '221 51% 12%', cardForeground: '0 0% 92%',
      popover: '221 51% 16%', popoverForeground: '0 0% 92%',
      secondary: '221 48% 19%', secondaryForeground: '0 0% 82%',
      muted: '221 48% 19%', mutedForeground: '217 20% 74%',
      accent: '220 46% 18%', accentForeground: '0 0% 92%',
      border: '220 42% 24%', input: '220 42% 24%',
      primaryForeground: '0 0% 0%',
    },
    light: {
      background: '0 0% 95%', foreground: '221 51% 16%',
      card: '0 0% 100%', cardForeground: '221 51% 16%',
      popover: '0 0% 100%', popoverForeground: '221 51% 16%',
      secondary: '220 20% 93%', secondaryForeground: '221 51% 20%',
      muted: '220 20% 93%', mutedForeground: '221 16% 30%',
      accent: '220 22% 89%', accentForeground: '221 51% 16%',
      border: '220 18% 85%', input: '220 18% 85%',
      primaryForeground: '0 0% 0%',
    },
  },

  harbor: {
    name:        'Harbor',
    description: 'Berkeley navy and powder blue with an imperial red accent',
    swatches:    ['#1d3557', '#457b9d', '#e63946', '#a8dadc', '#f1faee'],
    accentDark:  { h: 355, s: 85, l: 66 },
    accentLight: { h: 355, s: 70, l: 45 },
    // Red signature against the blues, plus a sandy warm for free agents so
    // the three tags don't collapse into one blue family.
    txDark:      { trade: '#e63946', waiver: '#a8dadc', freeAgent: '#f4a261' },
    txLight:     { trade: '#c1121f', waiver: '#457b9d', freeAgent: '#b56424' },
    dark: {
      background: '215 55% 5%', foreground: '105 45% 95%',
      card: '215 50% 15%', cardForeground: '105 45% 95%',
      popover: '215 48% 19%', popoverForeground: '105 45% 95%',
      secondary: '215 44% 22%', secondaryForeground: '105 20% 85%',
      muted: '215 44% 22%', mutedForeground: '182 36% 82%',
      accent: '215 45% 21%', accentForeground: '105 45% 95%',
      border: '203 39% 28%', input: '203 39% 28%',
      primaryForeground: '215 55% 6%',
    },
    light: {
      background: '105 40% 94%', foreground: '215 50% 20%',
      card: '0 0% 100%', cardForeground: '215 50% 20%',
      popover: '0 0% 100%', popoverForeground: '215 50% 20%',
      secondary: '182 35% 90%', secondaryForeground: '215 50% 22%',
      muted: '182 35% 90%', mutedForeground: '203 26% 30%',
      accent: '182 40% 86%', accentForeground: '215 50% 20%',
      border: '182 30% 82%', input: '182 30% 82%',
      primaryForeground: '0 0% 100%',
    },
  },

  ensign: {
    name:        'Ensign',
    description: 'Deep navy and crisp white with a signal red accent',
    swatches:    ['#000052', '#0c44ac', '#ed0101', '#970005', '#ffffff'],
    accentDark:  { h: 2, s: 92, l: 60 },
    accentLight: { h: 358, s: 100, l: 30 },
    txDark:      { trade: '#ed0101', waiver: '#4d82e8', freeAgent: '#c9ced9' },
    txLight:     { trade: '#970005', waiver: '#0c44ac', freeAgent: '#64748b' },
    dark: {
      background: '240 62% 3%', foreground: '0 0% 96%',
      card: '240 55% 15%', cardForeground: '0 0% 96%',
      popover: '240 50% 18%', popoverForeground: '0 0% 96%',
      secondary: '235 45% 21%', secondaryForeground: '0 0% 85%',
      muted: '235 45% 21%', mutedForeground: '225 25% 78%',
      accent: '237 48% 20%', accentForeground: '0 0% 96%',
      border: '219 60% 26%', input: '219 60% 26%',
      primaryForeground: '0 0% 100%',
    },
    light: {
      background: '0 0% 95%', foreground: '240 100% 16%',
      card: '0 0% 100%', cardForeground: '240 100% 16%',
      popover: '0 0% 100%', popoverForeground: '240 100% 16%',
      secondary: '220 25% 93%', secondaryForeground: '240 60% 20%',
      muted: '220 25% 93%', mutedForeground: '225 20% 30%',
      accent: '220 28% 89%', accentForeground: '240 100% 16%',
      border: '220 22% 85%', input: '220 22% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  midnight: {
    name:        'Midnight',
    description: 'Deep space blue with an electric sky accent',
    swatches:    ['#050912', '#0a1020', '#22d3ee', '#a78bfa', '#e8eef5'],
    accentDark:  { h: 194, s: 100, l: 54 },
    accentLight: { h: 194, s: 90, l: 36 },
    txDark:      { trade: '#22d3ee', waiver: '#a78bfa', freeAgent: '#94a3b8' },
    txLight:     { trade: '#0891b2', waiver: '#6d28d9', freeAgent: '#475569' },
    dark: {
      background: '222 45% 3%', foreground: '210 22% 93%',
      card: '221 38% 13%', cardForeground: '210 22% 93%',
      popover: '220 34% 17%', popoverForeground: '210 22% 93%',
      secondary: '220 28% 20%', secondaryForeground: '210 18% 82%',
      muted: '220 28% 20%', mutedForeground: '215 18% 72%',
      accent: '220 30% 19%', accentForeground: '210 22% 93%',
      border: '220 26% 24%', input: '220 26% 24%',
      primaryForeground: '222 45% 4%',
    },
    light: {
      background: '210 28% 94%', foreground: '222 38% 9%',
      card: '0 0% 100%', cardForeground: '222 38% 9%',
      popover: '0 0% 100%', popoverForeground: '222 38% 9%',
      secondary: '210 22% 92%', secondaryForeground: '222 28% 18%',
      muted: '210 22% 92%', mutedForeground: '215 16% 32%',
      accent: '210 20% 88%', accentForeground: '222 38% 9%',
      border: '210 18% 84%', input: '210 18% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  carbon: {
    name:        'Carbon',
    description: 'Pure neutral greys with an amber and cobalt pop',
    swatches:    ['#0a0a0a', '#262626', '#fbbf24', '#60a5fa', '#ebebeb'],
    accentDark:  { h: 45, s: 93, l: 52 },
    accentLight: { h: 38, s: 92, l: 38 },
    // The greys give nothing to build tags from, so the accents supply the
    // separation: warm amber, cool cobalt, neutral slate.
    txDark:      { trade: '#fbbf24', waiver: '#60a5fa', freeAgent: '#a3a3a3' },
    txLight:     { trade: '#b45309', waiver: '#1d4ed8', freeAgent: '#737373' },
    dark: {
      background: '0 0% 4%', foreground: '0 0% 94%',
      card: '0 0% 12%', cardForeground: '0 0% 94%',
      popover: '0 0% 16%', popoverForeground: '0 0% 94%',
      secondary: '0 0% 19%', secondaryForeground: '0 0% 84%',
      muted: '0 0% 19%', mutedForeground: '0 6% 72%',
      accent: '0 0% 18%', accentForeground: '0 0% 94%',
      border: '0 0% 24%', input: '0 0% 24%',
      primaryForeground: '0 0% 4%',
    },
    light: {
      background: '0 0% 95%', foreground: '0 0% 9%',
      card: '0 0% 100%', cardForeground: '0 0% 9%',
      popover: '0 0% 100%', popoverForeground: '0 0% 9%',
      secondary: '0 0% 93%', secondaryForeground: '0 0% 18%',
      muted: '0 0% 93%', mutedForeground: '0 6% 30%',
      accent: '0 0% 90%', accentForeground: '0 0% 9%',
      border: '0 0% 85%', input: '0 0% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  evergreen: {
    name:        'Evergreen',
    description: 'Forest greens with mint and a warm amber counterpoint',
    swatches:    ['#060f0c', '#123528', '#34d399', '#fbbf24', '#e6f0ec'],
    accentDark:  { h: 152, s: 76, l: 50 },
    accentLight: { h: 158, s: 78, l: 30 },
    txDark:      { trade: '#34d399', waiver: '#fbbf24', freeAgent: '#86efac' },
    txLight:     { trade: '#047857', waiver: '#b45309', freeAgent: '#4d7c0f' },
    dark: {
      background: '162 32% 4%', foreground: '150 18% 94%',
      card: '162 30% 14%', cardForeground: '150 18% 94%',
      popover: '162 28% 18%', popoverForeground: '150 18% 94%',
      secondary: '162 24% 21%', secondaryForeground: '150 14% 84%',
      muted: '162 24% 21%', mutedForeground: '155 16% 72%',
      accent: '162 26% 20%', accentForeground: '150 18% 94%',
      border: '162 22% 25%', input: '162 22% 25%',
      primaryForeground: '162 32% 5%',
    },
    light: {
      background: '150 28% 95%', foreground: '162 38% 11%',
      card: '0 0% 100%', cardForeground: '162 38% 11%',
      popover: '0 0% 100%', popoverForeground: '162 38% 11%',
      secondary: '150 20% 92%', secondaryForeground: '162 32% 18%',
      muted: '150 20% 92%', mutedForeground: '160 14% 30%',
      accent: '150 18% 89%', accentForeground: '162 38% 11%',
      border: '150 16% 85%', input: '150 16% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  oxblood: {
    name:        'Oxblood',
    description: 'Deep burgundy with rose and burnished amber',
    swatches:    ['#0d0406', '#2b0e15', '#fb7185', '#f59e0b', '#f0e6e8'],
    accentDark:  { h: 350, s: 88, l: 66 },
    accentLight: { h: 348, s: 78, l: 40 },
    txDark:      { trade: '#fb7185', waiver: '#f59e0b', freeAgent: '#cbb0b5' },
    txLight:     { trade: '#be123c', waiver: '#b45309', freeAgent: '#8d5f66' },
    dark: {
      background: '350 32% 4%', foreground: '350 14% 94%',
      card: '349 36% 14%', cardForeground: '350 14% 94%',
      popover: '349 32% 18%', popoverForeground: '350 14% 94%',
      secondary: '349 26% 21%', secondaryForeground: '350 12% 84%',
      muted: '349 26% 21%', mutedForeground: '350 14% 72%',
      accent: '349 28% 20%', accentForeground: '350 14% 94%',
      border: '349 24% 25%', input: '349 24% 25%',
      primaryForeground: '350 32% 5%',
    },
    light: {
      background: '350 26% 95%', foreground: '349 38% 13%',
      card: '0 0% 100%', cardForeground: '349 38% 13%',
      popover: '0 0% 100%', popoverForeground: '349 38% 13%',
      secondary: '350 20% 93%', secondaryForeground: '349 32% 19%',
      muted: '350 20% 93%', mutedForeground: '350 12% 32%',
      accent: '350 18% 90%', accentForeground: '349 38% 13%',
      border: '350 16% 86%', input: '350 16% 86%',
      primaryForeground: '0 0% 100%',
    },
  },

  sunset: {
    name:        'Sunset',
    description: 'Teal-navy depths with a fiery orange accent',
    swatches:    ['#001219', '#003049', '#f77f00', '#00b4d8', '#eae2b7'],
    accentDark:  { h: 31, s: 100, l: 50 },
    accentLight: { h: 22, s: 92, l: 40 },
    txDark:      { trade: '#f77f00', waiver: '#00b4d8', freeAgent: '#eae2b7' },
    txLight:     { trade: '#bc5000', waiver: '#0077b6', freeAgent: '#8a7f3d' },
    dark: {
      background: '199 90% 5%', foreground: '48 46% 93%',
      card: '199 80% 15%', cardForeground: '48 46% 93%',
      popover: '199 70% 19%', popoverForeground: '48 46% 93%',
      secondary: '199 60% 22%', secondaryForeground: '48 32% 84%',
      muted: '199 60% 22%', mutedForeground: '195 26% 76%',
      accent: '199 65% 21%', accentForeground: '48 46% 93%',
      border: '199 55% 26%', input: '199 55% 26%',
      primaryForeground: '199 90% 6%',
    },
    light: {
      background: '48 42% 94%', foreground: '199 100% 12%',
      card: '0 0% 100%', cardForeground: '199 100% 12%',
      popover: '0 0% 100%', popoverForeground: '199 100% 12%',
      secondary: '48 35% 91%', secondaryForeground: '199 80% 18%',
      muted: '48 35% 91%', mutedForeground: '199 22% 30%',
      accent: '48 32% 88%', accentForeground: '199 100% 12%',
      border: '48 28% 84%', input: '48 28% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  mocha: {
    name:        'Mocha',
    description: 'Roasted browns, soft wheat, and a sage counterpoint',
    swatches:    ['#0f0b08', '#432818', '#bb9457', '#6ba368', '#ffe6a7'],
    accentDark:  { h: 36, s: 48, l: 58 },
    accentLight: { h: 28, s: 55, l: 34 },
    txDark:      { trade: '#bb9457', waiver: '#6ba368', freeAgent: '#c9ada7' },
    txLight:     { trade: '#8a5a2b', waiver: '#3f6b3c', freeAgent: '#7d6b58' },
    dark: {
      background: '24 34% 5%', foreground: '39 58% 93%',
      card: '22 44% 15%', cardForeground: '39 58% 93%',
      popover: '22 40% 19%', popoverForeground: '39 58% 93%',
      secondary: '22 32% 22%', secondaryForeground: '39 40% 84%',
      muted: '22 32% 22%', mutedForeground: '30 22% 76%',
      accent: '22 36% 21%', accentForeground: '39 58% 93%',
      border: '22 28% 26%', input: '22 28% 26%',
      primaryForeground: '24 34% 6%',
    },
    light: {
      background: '39 54% 94%', foreground: '22 46% 14%',
      card: '0 0% 100%', cardForeground: '22 46% 14%',
      popover: '0 0% 100%', popoverForeground: '22 46% 14%',
      secondary: '39 42% 91%', secondaryForeground: '22 40% 20%',
      muted: '39 42% 91%', mutedForeground: '28 18% 30%',
      accent: '39 38% 88%', accentForeground: '22 46% 14%',
      border: '38 32% 84%', input: '38 32% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  porcelain: {
    name:        'Porcelain',
    description: 'Warm paper tones with a violet and fuchsia accent',
    swatches:    ['#0d0c0b', '#292420', '#a78bfa', '#f0abfc', '#faf7f2'],
    accentDark:  { h: 258, s: 88, l: 74 },
    accentLight: { h: 262, s: 72, l: 44 },
    txDark:      { trade: '#a78bfa', waiver: '#f0abfc', freeAgent: '#d6d3d1' },
    txLight:     { trade: '#7c3aed', waiver: '#a21caf', freeAgent: '#78716c' },
    dark: {
      background: '30 10% 5%', foreground: '30 12% 94%',
      card: '30 10% 15%', cardForeground: '30 12% 94%',
      popover: '30 9% 19%', popoverForeground: '30 12% 94%',
      secondary: '30 8% 22%', secondaryForeground: '30 8% 84%',
      muted: '30 8% 22%', mutedForeground: '30 8% 72%',
      accent: '30 9% 21%', accentForeground: '30 12% 94%',
      border: '30 7% 26%', input: '30 7% 26%',
      primaryForeground: '30 10% 6%',
    },
    light: {
      background: '40 30% 95%', foreground: '30 16% 13%',
      card: '0 0% 100%', cardForeground: '30 16% 13%',
      popover: '0 0% 100%', popoverForeground: '30 16% 13%',
      secondary: '38 24% 92%', secondaryForeground: '30 14% 19%',
      muted: '38 24% 92%', mutedForeground: '30 12% 32%',
      accent: '38 22% 89%', accentForeground: '30 16% 13%',
      border: '36 18% 85%', input: '36 18% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  nord: {
    name:        'Nord',
    description: 'Arctic slate with a frost-blue accent',
    swatches:    ['#2e3440', '#3b4252', '#88c0d0', '#a3be8c', '#eceff4'],
    accentDark:  { h: 193, s: 43, l: 67 },
    accentLight: { h: 210, s: 34, l: 38 },
    txDark:      { trade: '#88c0d0', waiver: '#a3be8c', freeAgent: '#d8dee9' },
    txLight:     { trade: '#417b8c', waiver: '#5a7247', freeAgent: '#6b7280' },
    dark: {
      background: '220 16% 12%', foreground: '218 27% 92%',
      card: '220 16% 22%', cardForeground: '218 27% 92%',
      popover: '220 16% 26%', popoverForeground: '218 27% 92%',
      secondary: '220 15% 29%', secondaryForeground: '218 20% 84%',
      muted: '220 15% 29%', mutedForeground: '219 16% 80%',
      accent: '220 16% 28%', accentForeground: '218 27% 92%',
      border: '220 14% 34%', input: '220 14% 34%',
      primaryForeground: '220 16% 12%',
    },
    light: {
      background: '218 27% 94%', foreground: '220 16% 18%',
      card: '0 0% 100%', cardForeground: '220 16% 18%',
      popover: '0 0% 100%', popoverForeground: '220 16% 18%',
      secondary: '218 22% 91%', secondaryForeground: '220 16% 24%',
      muted: '218 22% 91%', mutedForeground: '220 10% 32%',
      accent: '218 20% 88%', accentForeground: '220 16% 18%',
      border: '218 18% 84%', input: '218 18% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  synthwave: {
    name:        'Synthwave',
    description: 'Neon magenta and cyan over deep violet',
    swatches:    ['#0d0221', '#241734', '#ff2a6d', '#05d9e8', '#d1f7ff'],
    accentDark:  { h: 340, s: 100, l: 62 },
    accentLight: { h: 340, s: 82, l: 42 },
    txDark:      { trade: '#ff2a6d', waiver: '#05d9e8', freeAgent: '#b39ddb' },
    txLight:     { trade: '#c2185b', waiver: '#00838f', freeAgent: '#6a5acd' },
    dark: {
      background: '263 82% 7%', foreground: '191 100% 92%',
      card: '271 38% 17%', cardForeground: '191 100% 92%',
      popover: '271 36% 21%', popoverForeground: '191 100% 92%',
      secondary: '271 32% 24%', secondaryForeground: '191 60% 84%',
      muted: '271 32% 24%', mutedForeground: '280 22% 80%',
      accent: '271 34% 23%', accentForeground: '191 100% 92%',
      border: '271 30% 29%', input: '271 30% 29%',
      primaryForeground: '263 82% 8%',
    },
    light: {
      background: '280 40% 96%', foreground: '263 60% 16%',
      card: '0 0% 100%', cardForeground: '263 60% 16%',
      popover: '0 0% 100%', popoverForeground: '263 60% 16%',
      secondary: '280 30% 92%', secondaryForeground: '263 50% 22%',
      muted: '280 30% 92%', mutedForeground: '271 18% 32%',
      accent: '280 28% 89%', accentForeground: '263 60% 16%',
      border: '280 24% 85%', input: '280 24% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  ember: {
    name:        'Ember',
    description: 'Charcoal with a molten orange-red core',
    swatches:    ['#0c0a09', '#1c1917', '#f97316', '#fbbf24', '#fafaf9'],
    accentDark:  { h: 25, s: 95, l: 56 },
    accentLight: { h: 21, s: 90, l: 42 },
    txDark:      { trade: '#f97316', waiver: '#fbbf24', freeAgent: '#a8a29e' },
    txLight:     { trade: '#c2410c', waiver: '#b45309', freeAgent: '#78716c' },
    dark: {
      background: '20 14% 4%', foreground: '60 9% 96%',
      card: '20 12% 12%', cardForeground: '60 9% 96%',
      popover: '20 11% 16%', popoverForeground: '60 9% 96%',
      secondary: '20 10% 19%', secondaryForeground: '60 6% 85%',
      muted: '20 10% 19%', mutedForeground: '24 6% 74%',
      accent: '20 11% 18%', accentForeground: '60 9% 96%',
      border: '20 9% 24%', input: '20 9% 24%',
      primaryForeground: '20 14% 5%',
    },
    light: {
      background: '60 9% 95%', foreground: '20 14% 12%',
      card: '0 0% 100%', cardForeground: '20 14% 12%',
      popover: '0 0% 100%', popoverForeground: '20 14% 12%',
      secondary: '60 7% 92%', secondaryForeground: '20 12% 18%',
      muted: '60 7% 92%', mutedForeground: '24 6% 32%',
      accent: '40 10% 89%', accentForeground: '20 14% 12%',
      border: '40 8% 85%', input: '40 8% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  ultraviolet: {
    name:        'Ultraviolet',
    description: 'Near-black with an electric violet charge',
    swatches:    ['#08070c', '#17132a', '#8b5cf6', '#22d3ee', '#ede9fe'],
    accentDark:  { h: 258, s: 90, l: 70 },
    accentLight: { h: 262, s: 78, l: 46 },
    txDark:      { trade: '#8b5cf6', waiver: '#22d3ee', freeAgent: '#c4b5fd' },
    txLight:     { trade: '#6d28d9', waiver: '#0e7490', freeAgent: '#7c6f9b' },
    dark: {
      background: '255 26% 4%', foreground: '258 60% 94%',
      card: '253 37% 12%', cardForeground: '258 60% 94%',
      popover: '253 34% 16%', popoverForeground: '258 60% 94%',
      secondary: '253 30% 19%', secondaryForeground: '258 40% 85%',
      muted: '253 30% 19%', mutedForeground: '258 22% 80%',
      accent: '253 32% 18%', accentForeground: '258 60% 94%',
      border: '253 28% 25%', input: '253 28% 25%',
      primaryForeground: '255 26% 5%',
    },
    light: {
      background: '258 40% 96%', foreground: '253 40% 14%',
      card: '0 0% 100%', cardForeground: '253 40% 14%',
      popover: '0 0% 100%', popoverForeground: '253 40% 14%',
      secondary: '258 30% 92%', secondaryForeground: '253 34% 20%',
      muted: '258 30% 92%', mutedForeground: '253 16% 32%',
      accent: '258 28% 89%', accentForeground: '253 40% 14%',
      border: '258 24% 85%', input: '258 24% 85%',
      primaryForeground: '0 0% 100%',
    },
  },

  copper: {
    name:        'Copper',
    description: 'Deep teal patina with a burnished copper accent',
    swatches:    ['#04201f', '#0b3b38', '#c96f3f', '#5eead4', '#e8f5f3'],
    accentDark:  { h: 24, s: 62, l: 66 },
    accentLight: { h: 20, s: 60, l: 38 },
    txDark:      { trade: '#c96f3f', waiver: '#5eead4', freeAgent: '#9fbdb8' },
    txLight:     { trade: '#9a4f26', waiver: '#0f766e', freeAgent: '#5b7a75' },
    dark: {
      background: '178 68% 7%', foreground: '172 30% 93%',
      card: '176 68% 14%', cardForeground: '172 30% 93%',
      popover: '176 60% 18%', popoverForeground: '172 30% 93%',
      secondary: '176 50% 21%', secondaryForeground: '172 22% 84%',
      muted: '176 50% 21%', mutedForeground: '174 18% 76%',
      accent: '176 54% 20%', accentForeground: '172 30% 93%',
      border: '176 44% 26%', input: '176 44% 26%',
      primaryForeground: '178 68% 8%',
    },
    light: {
      background: '172 30% 95%', foreground: '178 55% 12%',
      card: '0 0% 100%', cardForeground: '178 55% 12%',
      popover: '0 0% 100%', popoverForeground: '178 55% 12%',
      secondary: '172 24% 91%', secondaryForeground: '178 45% 18%',
      muted: '172 24% 91%', mutedForeground: '176 16% 30%',
      accent: '172 22% 88%', accentForeground: '178 55% 12%',
      border: '172 20% 84%', input: '172 20% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  sakura: {
    name:        'Sakura',
    description: 'Soft blossom pinks over warm charcoal',
    swatches:    ['#12090d', '#2c1620', '#f472b6', '#fcd34d', '#fdf2f8'],
    accentDark:  { h: 330, s: 85, l: 70 },
    accentLight: { h: 333, s: 71, l: 45 },
    txDark:      { trade: '#f472b6', waiver: '#fcd34d', freeAgent: '#e5c6d4' },
    txLight:     { trade: '#be185d', waiver: '#b45309', freeAgent: '#8a6b78' },
    dark: {
      background: '336 33% 6%', foreground: '327 73% 96%',
      card: '332 34% 13%', cardForeground: '327 73% 96%',
      popover: '332 31% 17%', popoverForeground: '327 73% 96%',
      secondary: '332 27% 20%', secondaryForeground: '327 40% 86%',
      muted: '332 27% 20%', mutedForeground: '330 18% 80%',
      accent: '332 29% 19%', accentForeground: '327 73% 96%',
      border: '332 25% 26%', input: '332 25% 26%',
      primaryForeground: '336 33% 7%',
    },
    light: {
      background: '327 73% 97%', foreground: '332 40% 15%',
      card: '0 0% 100%', cardForeground: '332 40% 15%',
      popover: '0 0% 100%', popoverForeground: '332 40% 15%',
      secondary: '327 45% 93%', secondaryForeground: '332 34% 21%',
      muted: '327 45% 93%', mutedForeground: '332 16% 34%',
      accent: '327 40% 90%', accentForeground: '332 40% 15%',
      border: '327 34% 86%', input: '327 34% 86%',
      primaryForeground: '0 0% 100%',
    },
  },

  gridiron: {
    name:        'Gridiron',
    description: 'Turf green and chalk white with a pigskin accent',
    swatches:    ['#08130d', '#123524', '#d97706', '#4ade80', '#f0fdf4'],
    accentDark:  { h: 32, s: 88, l: 58 },
    accentLight: { h: 28, s: 90, l: 38 },
    txDark:      { trade: '#d97706', waiver: '#4ade80', freeAgent: '#d6e8dc' },
    txLight:     { trade: '#a15c07', waiver: '#15803d', freeAgent: '#5f7a6b' },
    dark: {
      background: '150 42% 5%', foreground: '138 60% 95%',
      card: '152 50% 14%', cardForeground: '138 60% 95%',
      popover: '152 45% 18%', popoverForeground: '138 60% 95%',
      secondary: '152 38% 21%', secondaryForeground: '138 30% 85%',
      muted: '152 38% 21%', mutedForeground: '145 20% 78%',
      accent: '152 42% 20%', accentForeground: '138 60% 95%',
      border: '152 34% 26%', input: '152 34% 26%',
      primaryForeground: '150 42% 6%',
    },
    light: {
      background: '138 55% 96%', foreground: '152 45% 12%',
      card: '0 0% 100%', cardForeground: '152 45% 12%',
      popover: '0 0% 100%', popoverForeground: '152 45% 12%',
      secondary: '138 32% 91%', secondaryForeground: '152 40% 18%',
      muted: '138 32% 91%', mutedForeground: '150 16% 30%',
      accent: '138 28% 88%', accentForeground: '152 45% 12%',
      border: '138 24% 84%', input: '138 24% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  slate: {
    name:        'Slate',
    description: 'Cool graphite with a clean sky accent',
    swatches:    ['#0b0f14', '#1b232e', '#38bdf8', '#a3e635', '#e2e8f0'],
    accentDark:  { h: 199, s: 89, l: 62 },
    accentLight: { h: 201, s: 85, l: 36 },
    txDark:      { trade: '#38bdf8', waiver: '#a3e635', freeAgent: '#94a3b8' },
    txLight:     { trade: '#0369a1', waiver: '#4d7c0f', freeAgent: '#475569' },
    dark: {
      background: '210 30% 6%', foreground: '213 31% 91%',
      card: '213 26% 14%', cardForeground: '213 31% 91%',
      popover: '213 24% 18%', popoverForeground: '213 31% 91%',
      secondary: '213 20% 21%', secondaryForeground: '213 22% 82%',
      muted: '213 20% 21%', mutedForeground: '213 14% 76%',
      accent: '213 22% 20%', accentForeground: '213 31% 91%',
      border: '213 18% 26%', input: '213 18% 26%',
      primaryForeground: '210 30% 7%',
    },
    light: {
      background: '213 31% 94%', foreground: '213 30% 14%',
      card: '0 0% 100%', cardForeground: '213 30% 14%',
      popover: '0 0% 100%', popoverForeground: '213 30% 14%',
      secondary: '213 24% 91%', secondaryForeground: '213 26% 20%',
      muted: '213 24% 91%', mutedForeground: '213 12% 32%',
      accent: '213 22% 88%', accentForeground: '213 30% 14%',
      border: '213 18% 84%', input: '213 18% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  goldenrod: {
    name:        'Goldenrod',
    description: 'Espresso depths with a rich gold accent',
    swatches:    ['#12100b', '#2a2418', '#eab308', '#84cc16', '#fefce8'],
    accentDark:  { h: 45, s: 93, l: 58 },
    accentLight: { h: 40, s: 92, l: 36 },
    txDark:      { trade: '#eab308', waiver: '#84cc16', freeAgent: '#d6d3c4' },
    txLight:     { trade: '#a16207', waiver: '#4d7c0f', freeAgent: '#78716c' },
    dark: {
      background: '45 22% 5%', foreground: '55 92% 95%',
      card: '43 27% 13%', cardForeground: '55 92% 95%',
      popover: '43 25% 17%', popoverForeground: '55 92% 95%',
      secondary: '43 21% 20%', secondaryForeground: '55 40% 85%',
      muted: '43 21% 20%', mutedForeground: '45 18% 76%',
      accent: '43 23% 19%', accentForeground: '55 92% 95%',
      border: '43 19% 25%', input: '43 19% 25%',
      primaryForeground: '45 22% 6%',
    },
    light: {
      background: '55 80% 96%', foreground: '43 32% 13%',
      card: '0 0% 100%', cardForeground: '43 32% 13%',
      popover: '0 0% 100%', popoverForeground: '43 32% 13%',
      secondary: '55 44% 91%', secondaryForeground: '43 28% 19%',
      muted: '55 44% 91%', mutedForeground: '45 16% 31%',
      accent: '55 38% 88%', accentForeground: '43 32% 13%',
      border: '52 32% 84%', input: '52 32% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  tidal: {
    name:        'Tidal',
    description: 'Abyssal blue-green with an aqua accent',
    swatches:    ['#03141c', '#0a2a38', '#2dd4bf', '#f472b6', '#e0f7fa'],
    accentDark:  { h: 172, s: 66, l: 55 },
    accentLight: { h: 176, s: 72, l: 32 },
    txDark:      { trade: '#2dd4bf', waiver: '#f472b6', freeAgent: '#9ec6d0' },
    txLight:     { trade: '#0f766e', waiver: '#be185d', freeAgent: '#4b6c78' },
    dark: {
      background: '196 72% 6%', foreground: '187 60% 93%',
      card: '195 70% 13%', cardForeground: '187 60% 93%',
      popover: '195 62% 17%', popoverForeground: '187 60% 93%',
      secondary: '195 52% 20%', secondaryForeground: '187 32% 84%',
      muted: '195 52% 20%', mutedForeground: '190 24% 77%',
      accent: '195 56% 19%', accentForeground: '187 60% 93%',
      border: '195 46% 25%', input: '195 46% 25%',
      primaryForeground: '196 72% 7%',
    },
    light: {
      background: '187 55% 95%', foreground: '195 60% 12%',
      card: '0 0% 100%', cardForeground: '195 60% 12%',
      popover: '0 0% 100%', popoverForeground: '195 60% 12%',
      secondary: '187 36% 91%', secondaryForeground: '195 50% 18%',
      muted: '187 36% 91%', mutedForeground: '193 18% 30%',
      accent: '187 32% 88%', accentForeground: '195 60% 12%',
      border: '187 28% 84%', input: '187 28% 84%',
      primaryForeground: '0 0% 100%',
    },
  },

  crimson: {
    name:        'Crimson',
    description: 'Blackened plum with a scarlet edge',
    swatches:    ['#0e0709', '#2b0f16', '#ef4444', '#fb923c', '#fee2e2'],
    accentDark:  { h: 0, s: 84, l: 63 },
    accentLight: { h: 0, s: 74, l: 42 },
    txDark:      { trade: '#ef4444', waiver: '#fb923c', freeAgent: '#e0b7bb' },
    txLight:     { trade: '#b91c1c', waiver: '#c2410c', freeAgent: '#8b5f63' },
    dark: {
      background: '345 34% 5%', foreground: '0 86% 95%',
      card: '346 47% 12%', cardForeground: '0 86% 95%',
      popover: '346 42% 16%', popoverForeground: '0 86% 95%',
      secondary: '346 34% 19%', secondaryForeground: '0 40% 86%',
      muted: '346 34% 19%', mutedForeground: '350 20% 78%',
      accent: '346 38% 18%', accentForeground: '0 86% 95%',
      border: '346 30% 25%', input: '346 30% 25%',
      primaryForeground: '345 34% 6%',
    },
    light: {
      background: '0 80% 97%', foreground: '346 45% 14%',
      card: '0 0% 100%', cardForeground: '346 45% 14%',
      popover: '0 0% 100%', popoverForeground: '346 45% 14%',
      secondary: '0 45% 93%', secondaryForeground: '346 38% 20%',
      muted: '0 45% 93%', mutedForeground: '348 18% 33%',
      accent: '0 38% 90%', accentForeground: '346 45% 14%',
      border: '0 32% 86%', input: '0 32% 86%',
      primaryForeground: '0 0% 100%',
    },
  },

  linen: {
    name:        'Linen',
    description: 'Light-first oatmeal with a deep teal accent',
    swatches:    ['#1c1a17', '#33302a', '#0d9488', '#c2410c', '#faf7f0'],
    accentDark:  { h: 174, s: 62, l: 52 },
    accentLight: { h: 175, s: 84, l: 28 },
    txDark:      { trade: '#2dd4bf', waiver: '#fb923c', freeAgent: '#cfc9bd' },
    txLight:     { trade: '#0f766e', waiver: '#c2410c', freeAgent: '#7a7266' },
    dark: {
      background: '35 12% 7%', foreground: '40 38% 94%',
      card: '35 11% 15%', cardForeground: '40 38% 94%',
      popover: '35 10% 19%', popoverForeground: '40 38% 94%',
      secondary: '35 9% 22%', secondaryForeground: '40 22% 84%',
      muted: '35 9% 22%', mutedForeground: '38 12% 78%',
      accent: '35 10% 21%', accentForeground: '40 38% 94%',
      border: '35 8% 27%', input: '35 8% 27%',
      primaryForeground: '35 12% 8%',
    },
    light: {
      background: '40 44% 96%', foreground: '35 20% 14%',
      card: '0 0% 100%', cardForeground: '35 20% 14%',
      popover: '0 0% 100%', popoverForeground: '35 20% 14%',
      secondary: '40 30% 91%', secondaryForeground: '35 18% 20%',
      muted: '40 30% 91%', mutedForeground: '36 12% 32%',
      accent: '40 26% 88%', accentForeground: '35 20% 14%',
      border: '38 22% 84%', input: '38 22% 84%',
      primaryForeground: '0 0% 100%',
    },
  },
};

export const DEFAULT_THEME: ThemeConfig = {
  palette:       'prussian',
  primaryH:      37,
  primaryS:      98,
  primaryL:      53,
  primaryHLight: 37,
  primarySLight: 98,
  primaryLLight: 42,
  radiusRem:     0.5,
  fontPair:      'bricolage-dm',
  background:    'grid',
  motion:        'full',
  logoUrl:       null,
  leagueName:    null,
  sound:         'off',
  haptics:       'on',
  faviconUrl:    null,
  siteTitle:     null,
  siteDescription: null,
  txColorsDark:  DEFAULT_TX_DARK,
  txColorsLight: DEFAULT_TX_LIGHT,
};

export const fontPairs: Record<FontPairKey, {
  display:     string;
  body:        string;
  googleQuery: string;
  preview:     string;
}> = {
  'bricolage-dm': {
    display:     'Bricolage Grotesque',
    body:        'DM Sans',
    googleQuery: 'family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700',
    preview:     'Editorial & Modern',
  },
  'syne-dm': {
    display:     'Syne',
    body:        'DM Sans',
    googleQuery: 'family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600',
    preview:     'Geometric & Precise',
  },
  'fraunces-outfit': {
    display:     'Fraunces',
    body:        'Outfit',
    googleQuery: 'family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Outfit:wght@300;400;500;600;700',
    preview:     'Contrast & Character',
  },
  'outfit': {
    display:     'Outfit',
    body:        'Outfit',
    googleQuery: 'family=Outfit:wght@300;400;500;600;700',
    preview:     'Clean & Minimal',
  },
  'anton-inter': {
    display:     'Anton',
    body:        'Inter',
    googleQuery: 'family=Anton&family=Inter:wght@300;400;500;600;700',
    preview:     'Bold & Athletic',
  },
  'bebas-inter': {
    display:     'Bebas Neue',
    body:        'Inter',
    googleQuery: 'family=Bebas+Neue&family=Inter:wght@300;400;500;600;700',
    preview:     'Condensed & Loud',
  },
  'oswald-roboto': {
    display:     'Oswald',
    body:        'Roboto',
    googleQuery: 'family=Oswald:wght@400;500;600;700&family=Roboto:wght@300;400;500;700',
    preview:     'Broadcast & Classic',
  },
  'space-inter': {
    display:     'Space Grotesk',
    body:        'Inter',
    googleQuery: 'family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700',
    preview:     'Technical & Sharp',
  },
  'playfair-source': {
    display:     'Playfair Display',
    body:        'Source Sans 3',
    googleQuery: 'family=Playfair+Display:wght@400;600;700;800&family=Source+Sans+3:wght@300;400;500;600;700',
    preview:     'Classic & Refined',
  },
  'unbounded-dm': {
    display:     'Unbounded',
    body:        'DM Sans',
    googleQuery: 'family=Unbounded:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600',
    preview:     'Expressive & Wide',
  },
  'instrument-inter': {
    display:     'Instrument Serif',
    body:        'Inter',
    googleQuery: 'family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700',
    preview:     'Editorial & Elegant',
  },
  'archivo-inter': {
    display:     'Archivo Black',
    body:        'Inter',
    googleQuery: 'family=Archivo+Black&family=Inter:wght@300;400;500;600;700',
    preview:     'Heavy & Impactful',
  },
  'chakra-inter': {
    display:     'Chakra Petch',
    body:        'Inter',
    googleQuery: 'family=Chakra+Petch:wght@500;600;700&family=Inter:wght@300;400;500;600;700',
    preview:     'Sporty & Angular',
  },
  'teko-inter': {
    display:     'Teko',
    body:        'Inter',
    googleQuery: 'family=Teko:wght@500;600;700&family=Inter:wght@300;400;500;600;700',
    preview:     'Tall & Scoreboard',
  },
  'rubikmono-inter': {
    display:     'Rubik Mono One',
    body:        'Inter',
    googleQuery: 'family=Rubik+Mono+One&family=Inter:wght@300;400;500;600;700',
    preview:     'Blocky & Retro',
  },
  'sora-inter': {
    display:     'Sora',
    body:        'Inter',
    googleQuery: 'family=Sora:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700',
    preview:     'Modern & Neutral',
  },
  'familjen-inter': {
    display:     'Familjen Grotesk',
    body:        'Inter',
    googleQuery: 'family=Familjen+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700',
    preview:     'Swiss & Quiet',
  },
  'dmserif-dm': {
    display:     'DM Serif Display',
    body:        'DM Sans',
    googleQuery: 'family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600',
    preview:     'Stately & Serif',
  },
  'baskerville-inter': {
    display:     'Libre Baskerville',
    body:        'Inter',
    googleQuery: 'family=Libre+Baskerville:wght@400;700&family=Inter:wght@300;400;500;600;700',
    preview:     'Bookish & Traditional',
  },
};

/** `l` is the dark-mode lightness, `lLight` the light-mode one — accents need
 *  to sit lower on white to stay legible. */
export const accentPresets: Array<{ name: string; h: number; s: number; l: number; lLight: number }> = [
  { name: 'Amber',   h:  37, s: 98, l: 53, lLight: 42 },
  { name: 'Teal',    h: 177, s: 89, l: 44, lLight: 33 },
  { name: 'Sky',     h: 194, s: 100, l: 54, lLight: 36 },
  { name: 'Blue',    h: 213, s: 94, l: 56, lLight: 40 },
  { name: 'Violet',  h: 258, s: 85, l: 66, lLight: 44 },
  { name: 'Rose',    h: 350, s: 86, l: 60, lLight: 40 },
  { name: 'Orange',  h:  25, s: 95, l: 53, lLight: 42 },
  { name: 'Emerald', h: 152, s: 76, l: 50, lLight: 32 },
  { name: 'Lime',    h:  84, s: 70, l: 50, lLight: 30 },
  { name: 'Slate',   h: 215, s: 25, l: 58, lLight: 35 },
];

// ─── CSS generation ───────────────────────────────────────────────────────
// Shared by the server-side ThemeInjector and the admin panel's live preview
// so the two can never drift out of sync. Emits BOTH :root and .dark blocks
// rather than resolving one mode, so toggling light/dark keeps working while
// previewing.

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function txVars(c: TxColors): string {
  return `
    --tx-trade:        ${c.trade};
    --tx-trade-muted:  ${rgba(c.trade, 0.1)};
    --tx-trade-dim:    ${rgba(c.trade, 0.3)};
    --tx-trade-grad:   linear-gradient(to right,${rgba(c.trade, 0.8)},${rgba(c.trade, 0.4)},transparent);
    --tx-waiver:       ${c.waiver};
    --tx-waiver-muted: ${rgba(c.waiver, 0.1)};
    --tx-waiver-dim:   ${rgba(c.waiver, 0.3)};
    --tx-waiver-grad:  linear-gradient(to right,${rgba(c.waiver, 0.8)},${rgba(c.waiver, 0.4)},transparent);
    --tx-fa:           ${c.freeAgent};
    --tx-fa-muted:     ${rgba(c.freeAgent, 0.1)};
    --tx-fa-dim:       ${rgba(c.freeAgent, 0.3)};
    --tx-fa-grad:      linear-gradient(to right,${rgba(c.freeAgent, 0.8)},${rgba(c.freeAgent, 0.4)},transparent);
  `;
}

function surfaceVars(s: SurfaceTokens, primary: string): string {
  return `
    --primary:              ${primary};
    --primary-foreground:   ${s.primaryForeground};
    --ring:                 ${primary};
    --background:           ${s.background};
    --foreground:           ${s.foreground};
    --card:                 ${s.card};
    --card-foreground:      ${s.cardForeground};
    --popover:              ${s.popover};
    --popover-foreground:   ${s.popoverForeground};
    --secondary:            ${s.secondary};
    --secondary-foreground: ${s.secondaryForeground};
    --muted:                ${s.muted};
    --muted-foreground:     ${s.mutedForeground};
    --accent:               ${s.accent};
    --accent-foreground:    ${s.accentForeground};
    --border:               ${s.border};
    --input:                ${s.input};
  `;
}

/** The complete CSS variable override sheet for a saved theme. */
export function buildThemeCss(theme: ThemeConfig): string {
  const palette = palettes[theme.palette] ?? palettes[DEFAULT_THEME.palette];
  const pair = fontPairs[theme.fontPair] ?? fontPairs[DEFAULT_THEME.fontPair];

  const primaryDark  = `${theme.primaryH} ${theme.primaryS}% ${theme.primaryL}%`;
  const primaryLight = `${theme.primaryHLight} ${theme.primarySLight}% ${theme.primaryLLight}%`;

  return `
    :root {
      ${surfaceVars(palette.light, primaryLight)}
      --radius: ${theme.radiusRem}rem;
      --font-display: '${pair.display}';
      --font-body:    '${pair.body}';
      ${txVars(theme.txColorsLight ?? DEFAULT_TX_LIGHT)}
    }
    .dark {
      ${surfaceVars(palette.dark, primaryDark)}
      ${txVars(theme.txColorsDark ?? DEFAULT_TX_DARK)}
    }
  `;
}

export const txColorPresets: Array<{
  name:  string;
  dark:  TxColors;
  light: TxColors;
}> = [
  {
    name:  'Classic',
    dark:  { trade: '#f59e0b', waiver: '#38bdf8', freeAgent: '#34d399' },
    light: { trade: '#d97706', waiver: '#0284c7', freeAgent: '#059669' },
  },
  {
    name:  'Vivid',
    dark:  { trade: '#f43f5e', waiver: '#8b5cf6', freeAgent: '#06b6d4' },
    light: { trade: '#e11d48', waiver: '#7c3aed', freeAgent: '#0891b2' },
  },
  {
    name:  'Neon',
    dark:  { trade: '#fb923c', waiver: '#a78bfa', freeAgent: '#4ade80' },
    light: { trade: '#ea580c', waiver: '#7c3aed', freeAgent: '#16a34a' },
  },
  {
    name:  'Cool',
    dark:  { trade: '#818cf8', waiver: '#67e8f9', freeAgent: '#a3e635' },
    light: { trade: '#4f46e5', waiver: '#0e7490', freeAgent: '#65a30d' },
  },
  {
    name:  'Warm',
    dark:  { trade: '#f87171', waiver: '#fb923c', freeAgent: '#fbbf24' },
    light: { trade: '#dc2626', waiver: '#ea580c', freeAgent: '#d97706' },
  },
];
