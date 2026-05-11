/**
 * Theme types and constants. Safe to import on both client and server.
 * Actual storage functions live in themeStorage.ts (server-only).
 */

export type FontPairKey = 'bricolage-dm' | 'syne-dm' | 'fraunces-outfit' | 'outfit';

export interface TxColors {
  trade:     string;  // hex
  waiver:    string;
  freeAgent: string;
}

export interface ThemeConfig {
  primaryH:      number;      // dark mode accent hue 0–360
  primaryS:      number;      // dark mode accent saturation 0–100 (%)
  primaryHLight: number;      // light mode accent hue
  primarySLight: number;      // light mode accent saturation
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

export const DEFAULT_THEME: ThemeConfig = {
  primaryH:      177,
  primaryS:      89,
  primaryHLight: 177,
  primarySLight: 89,
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

export const accentPresets: Array<{ name: string; h: number; s: number }> = [
  { name: 'Teal',    h: 177, s: 89 },
  { name: 'Blue',    h: 213, s: 94 },
  { name: 'Violet',  h: 258, s: 85 },
  { name: 'Rose',    h: 350, s: 86 },
  { name: 'Orange',  h:  25, s: 95 },
  { name: 'Amber',   h:  45, s: 93 },
  { name: 'Emerald', h: 152, s: 76 },
  { name: 'Slate',   h: 215, s: 25 },
];

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
