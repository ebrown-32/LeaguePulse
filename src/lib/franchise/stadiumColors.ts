/**
 * Every color a stadium is painted in, decided in one place: what each part
 * comes out as on its own (from the stadium's main color, which is the
 * franchise's unless the manager picked one, the accent, the facade, the
 * seat pattern and the style), and the manager's own color for any part they
 * paint themselves (StadiumLook.colors). The 3D view draws from this, and the
 * studio shows the same colors on its swatches, so "Auto" is never a guess.
 *
 * Pure: no three.js, so the studio and the tests can use it too.
 */

import { COLOR_SLOTS, type ColorSlot, type StadiumLook } from './model.ts';

export const FACADE: Record<StadiumLook['facade'], { wall: string; trim: string; metal: number; rough: number; glass?: boolean }> = {
  concrete: { wall: '#cfcac0', trim: '#9e978a', metal: 0, rough: 0.9 },
  brick: { wall: '#9c4a32', trim: '#e6dccb', metal: 0, rough: 0.95 },
  // Kept matte: with nothing in the scene to reflect, any real metalness renders near black.
  glass: { wall: '#8cc2e3', trim: '#d8e4ec', metal: 0.05, rough: 0.15, glass: true },
  steel: { wall: '#a3adb7', trim: '#d3d9de', metal: 0.05, rough: 0.5 },
  stone: { wall: '#d8ccb2', trim: '#b5a586', metal: 0, rough: 0.92 },
};

export const LIGHT: Record<Exclude<StadiumLook['lights'], 'team'>, string> = { warm: '#fff1cf', white: '#eef5ff' };

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (c: number[]) => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
// Linear-light, as three.js mixes them, so a swatch here matches the color drawn there.
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** a toward b by t, blended as light does. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t)), A = rgb(a).map(lin), B = rgb(b).map(lin);
  return toHex(A.map((v, i) => srgb(v + (B[i] - v) * k)));
}

/** How bright a color looks, 0 to 1. */
export function lightness(hex: string): number {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The stadium's main color: the manager's pick for it, or the franchise's own color. */
export const primaryOf = (look: Partial<Pick<StadiumLook, 'primary'>>, team: string) => look.primary ?? team;

/** The accent: the manager's, or white or black to suit the stadium's main color. */
export const accentOf = (look: Pick<StadiumLook, 'accent'> & Partial<Pick<StadiumLook, 'primary'>>, team: string) =>
  look.accent ?? (lightness(primaryOf(look, team)) > 0.6 ? '#1b1d21' : '#f4f4f2');

/** What each part comes out as when the manager leaves it alone. */
export function autoColors(look: StadiumLook, franchise: string): Record<ColorSlot, string> {
  const team = primaryOf(look, franchise);
  const accent = accentOf(look, team), gray = '#9aa0a6';
  const seats: Record<StadiumLook['seats'], [string, string]> = {
    team: [mixHex(team, gray, 0.2), mixHex(team, '#ffffff', 0.22)],
    split: [mixHex(team, gray, 0.2), mixHex(accent, gray, 0.15)],
    classic: ['#3d6fa8', '#8d939b'],
    mono: ['#2f3338', '#3a3f45'],
    ombre: [team, accent],
    checker: [mixHex(team, gray, 0.2), mixHex(accent, gray, 0.15)],
  };
  const field = look.field === 'blue' ? '#2a62b5' : look.field === 'black' ? '#23272b' : look.field === 'team' ? mixHex(team, '#000000', 0.15) : '#3a8a3e';
  const roof = look.style === 'grandstand' ? mixHex(team, '#2b2f33', 0.5) : look.style === 'dome' ? '#e9f2ff' : look.style === 'cantilever' ? '#f2f4f6' : '#eef1f4';
  const ink = lightness(team) > 0.55 ? '#15181c' : '#ffffff';
  return {
    seats: seats[look.seats][0], seats2: seats[look.seats][1],
    walls: FACADE[look.facade].wall, trim: FACADE[look.facade].trim,
    roof, steel: '#c9ced3', podium: '#1d2733',
    field, endzones: team,
    lettering: look.accent && Math.abs(lightness(look.accent) - lightness(team)) > 0.25 ? look.accent : ink,
    lights: look.lights === 'team' ? mixHex(team, '#ffffff', 0.25) : LIGHT[look.lights],
    crowd: team, posts: '#f2c81b', boards: '#2a2e33',
  };
}

/** Every part's color: the manager's where they painted it, otherwise its own. */
export function stadiumColors(look: StadiumLook, team: string): Record<ColorSlot, string> {
  const auto = autoColors(look, team);
  const out = { ...auto };
  for (const k of COLOR_SLOTS) { const c = look.colors?.[k]; if (c) out[k] = c; }
  return out;
}
