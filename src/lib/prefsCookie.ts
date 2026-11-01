/**
 * A visitor's preferences as their cookie holds them (lib/prefs), readable on the server too: the
 * root layout lays out the first paint with them.
 */

export interface Prefs { sound?: boolean; haptics?: boolean; motion?: 'full' | 'reduced'; music?: boolean; liveStrip?: boolean }

export const PREFS_COOKIE = 'lp_prefs';

/** The cookie's value, read on the server or in the browser. Anything malformed is no preference. */
export function parsePrefs(raw: string | undefined | null): Prefs {
  if (!raw) return {};
  try {
    const p = JSON.parse(decodeURIComponent(raw));
    const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
    return {
      sound: bool(p.sound), haptics: bool(p.haptics), music: bool(p.music), liveStrip: bool(p.liveStrip),
      motion: p.motion === 'full' || p.motion === 'reduced' ? p.motion : undefined,
    };
  } catch { return {}; }
}
