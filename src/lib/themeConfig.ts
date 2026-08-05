/**
 * Theme types and constants. Safe to import on both client and server.
 * Actual storage functions live in themeStorage.ts (server-only).
 */

export type FontPairKey = 'bricolage-dm' | 'syne-dm' | 'fraunces-outfit' | 'outfit';

export type PaletteKey =
  | 'prussian' | 'harbor'   | 'ensign'   | 'midnight'
  | 'carbon'   | 'evergreen'| 'oxblood'  | 'sunset'
  | 'mocha'    | 'porcelain';

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
  logoUrl:       string | null;
  leagueName:    string | null;
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
      muted: '221 48% 19%', mutedForeground: '217 22% 64%',
      accent: '220 46% 18%', accentForeground: '0 0% 92%',
      border: '220 42% 24%', input: '220 42% 24%',
      primaryForeground: '0 0% 0%',
    },
    light: {
      background: '0 0% 95%', foreground: '221 51% 16%',
      card: '0 0% 100%', cardForeground: '221 51% 16%',
      popover: '0 0% 100%', popoverForeground: '221 51% 16%',
      secondary: '220 20% 93%', secondaryForeground: '221 51% 20%',
      muted: '220 20% 93%', mutedForeground: '221 18% 40%',
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
      muted: '215 44% 22%', mutedForeground: '182 38% 72%',
      accent: '215 45% 21%', accentForeground: '105 45% 95%',
      border: '203 39% 28%', input: '203 39% 28%',
      primaryForeground: '215 55% 6%',
    },
    light: {
      background: '105 40% 94%', foreground: '215 50% 20%',
      card: '0 0% 100%', cardForeground: '215 50% 20%',
      popover: '0 0% 100%', popoverForeground: '215 50% 20%',
      secondary: '182 35% 90%', secondaryForeground: '215 50% 22%',
      muted: '182 35% 90%', mutedForeground: '203 28% 40%',
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
      muted: '235 45% 21%', mutedForeground: '225 27% 68%',
      accent: '237 48% 20%', accentForeground: '0 0% 96%',
      border: '219 60% 26%', input: '219 60% 26%',
      primaryForeground: '0 0% 100%',
    },
    light: {
      background: '0 0% 95%', foreground: '240 100% 16%',
      card: '0 0% 100%', cardForeground: '240 100% 16%',
      popover: '0 0% 100%', popoverForeground: '240 100% 16%',
      secondary: '220 25% 93%', secondaryForeground: '240 60% 20%',
      muted: '220 25% 93%', mutedForeground: '225 22% 40%',
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
      muted: '220 28% 20%', mutedForeground: '215 20% 62%',
      accent: '220 30% 19%', accentForeground: '210 22% 93%',
      border: '220 26% 24%', input: '220 26% 24%',
      primaryForeground: '222 45% 4%',
    },
    light: {
      background: '210 28% 94%', foreground: '222 38% 9%',
      card: '0 0% 100%', cardForeground: '222 38% 9%',
      popover: '0 0% 100%', popoverForeground: '222 38% 9%',
      secondary: '210 22% 92%', secondaryForeground: '222 28% 18%',
      muted: '210 22% 92%', mutedForeground: '215 18% 42%',
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
      muted: '0 0% 19%', mutedForeground: '0 0% 62%',
      accent: '0 0% 18%', accentForeground: '0 0% 94%',
      border: '0 0% 24%', input: '0 0% 24%',
      primaryForeground: '0 0% 4%',
    },
    light: {
      background: '0 0% 95%', foreground: '0 0% 9%',
      card: '0 0% 100%', cardForeground: '0 0% 9%',
      popover: '0 0% 100%', popoverForeground: '0 0% 9%',
      secondary: '0 0% 93%', secondaryForeground: '0 0% 18%',
      muted: '0 0% 93%', mutedForeground: '0 0% 40%',
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
      muted: '162 24% 21%', mutedForeground: '155 18% 62%',
      accent: '162 26% 20%', accentForeground: '150 18% 94%',
      border: '162 22% 25%', input: '162 22% 25%',
      primaryForeground: '162 32% 5%',
    },
    light: {
      background: '150 28% 95%', foreground: '162 38% 11%',
      card: '0 0% 100%', cardForeground: '162 38% 11%',
      popover: '0 0% 100%', popoverForeground: '162 38% 11%',
      secondary: '150 20% 92%', secondaryForeground: '162 32% 18%',
      muted: '150 20% 92%', mutedForeground: '160 16% 40%',
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
      muted: '349 26% 21%', mutedForeground: '350 16% 62%',
      accent: '349 28% 20%', accentForeground: '350 14% 94%',
      border: '349 24% 25%', input: '349 24% 25%',
      primaryForeground: '350 32% 5%',
    },
    light: {
      background: '350 26% 95%', foreground: '349 38% 13%',
      card: '0 0% 100%', cardForeground: '349 38% 13%',
      popover: '0 0% 100%', popoverForeground: '349 38% 13%',
      secondary: '350 20% 93%', secondaryForeground: '349 32% 19%',
      muted: '350 20% 93%', mutedForeground: '350 14% 42%',
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
      muted: '199 60% 22%', mutedForeground: '195 28% 66%',
      accent: '199 65% 21%', accentForeground: '48 46% 93%',
      border: '199 55% 26%', input: '199 55% 26%',
      primaryForeground: '199 90% 6%',
    },
    light: {
      background: '48 42% 94%', foreground: '199 100% 12%',
      card: '0 0% 100%', cardForeground: '199 100% 12%',
      popover: '0 0% 100%', popoverForeground: '199 100% 12%',
      secondary: '48 35% 91%', secondaryForeground: '199 80% 18%',
      muted: '48 35% 91%', mutedForeground: '199 24% 40%',
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
      muted: '22 32% 22%', mutedForeground: '30 24% 66%',
      accent: '22 36% 21%', accentForeground: '39 58% 93%',
      border: '22 28% 26%', input: '22 28% 26%',
      primaryForeground: '24 34% 6%',
    },
    light: {
      background: '39 54% 94%', foreground: '22 46% 14%',
      card: '0 0% 100%', cardForeground: '22 46% 14%',
      popover: '0 0% 100%', popoverForeground: '22 46% 14%',
      secondary: '39 42% 91%', secondaryForeground: '22 40% 20%',
      muted: '39 42% 91%', mutedForeground: '28 20% 40%',
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
      muted: '30 8% 22%', mutedForeground: '30 10% 62%',
      accent: '30 9% 21%', accentForeground: '30 12% 94%',
      border: '30 7% 26%', input: '30 7% 26%',
      primaryForeground: '30 10% 6%',
    },
    light: {
      background: '40 30% 95%', foreground: '30 16% 13%',
      card: '0 0% 100%', cardForeground: '30 16% 13%',
      popover: '0 0% 100%', popoverForeground: '30 16% 13%',
      secondary: '38 24% 92%', secondaryForeground: '30 14% 19%',
      muted: '38 24% 92%', mutedForeground: '30 14% 42%',
      accent: '38 22% 89%', accentForeground: '30 16% 13%',
      border: '36 18% 85%', input: '36 18% 85%',
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
  logoUrl:       null,
  leagueName:    null,
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
