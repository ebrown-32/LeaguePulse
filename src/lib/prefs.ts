/**
 * A visitor's own preferences, in this browser: over the league's defaults (the admin's
 * appearance settings), never instead of them. Anything left unset follows the league.
 *
 *   sound      interface clicks (lib/feedback)
 *   haptics    a tap you can feel, where the phone can
 *   motion     'reduced' calms the site's animation, 'full' restores it
 *   music      League Wrapped's soundtrack (lib/wrapped/music)
 *   liveStrip  the live scores bar while games are on (components/layout/LiveStrip)
 *
 * Kept in a cookie, not local storage, so the server can lay out the first paint with them
 * (reduced motion is on <html> before any script runs: app/layout).
 */

import { useSyncExternalStore } from 'react';
import { PREFS_COOKIE, parsePrefs, type Prefs } from './prefsCookie';

export { PREFS_COOKIE, parsePrefs, type Prefs };

// ── In the browser ─────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
let cache: { raw: string; prefs: Prefs } | null = null;
const EMPTY: Prefs = {};

function cookieRaw(): string {
  if (typeof document === 'undefined') return '';
  return document.cookie.split('; ').find(c => c.startsWith(`${PREFS_COOKIE}=`))?.slice(PREFS_COOKIE.length + 1) ?? '';
}

export function getPrefs(): Prefs {
  const raw = cookieRaw();
  if (!raw) return EMPTY;
  if (cache?.raw !== raw) cache = { raw, prefs: parsePrefs(raw) };
  return cache.prefs;
}

/** Sets some preferences; `undefined` returns one to the league's default. */
export function setPrefs(patch: Partial<Prefs>) {
  const next: Prefs = { ...getPrefs(), ...patch };
  for (const k of Object.keys(next) as (keyof Prefs)[]) if (next[k] === undefined) delete next[k];
  const value = encodeURIComponent(JSON.stringify(next));
  document.cookie = Object.keys(next).length
    ? `${PREFS_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
    : `${PREFS_COOKIE}=; path=/; max-age=0; samesite=lax`;
  applyMotion();
  for (const l of listeners) l();
}

/** Reduced motion on <html>: the visitor's choice, else the league's (data-league-motion, from the server). */
export function applyMotion() {
  const html = document.documentElement;
  const motion = getPrefs().motion ?? html.dataset.leagueMotion;
  if (motion) html.dataset.motion = motion; else delete html.dataset.motion;
}

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** The visitor's preferences, kept current as they change. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => EMPTY);
}
