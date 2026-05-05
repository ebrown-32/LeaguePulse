/**
 * Theme types and constants — safe to import on both client and server.
 * Actual storage functions live in themeStorage.ts (server-only).
 */

export type FontPairKey = 'bricolage-dm' | 'syne-dm' | 'fraunces-outfit' | 'outfit';

export interface ThemeConfig {
  primaryH:   number;      // 0–360
  primaryS:   number;      // 0–100 (%)
  radiusRem:  number;      // e.g. 0, 0.25, 0.5, 0.75, 1
  fontPair:   FontPairKey;
  logoUrl:    string | null;
  leagueName: string | null;
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryH:   177,
  primaryS:   89,
  radiusRem:  0.5,
  fontPair:   'bricolage-dm',
  logoUrl:    null,
  leagueName: null,
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
