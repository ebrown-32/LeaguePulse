/**
 * Sleeper player id to ESPN athlete id.
 *
 * Everything live keys off this: ESPN's play by play names athletes by ESPN
 * id, and the league's rosters are Sleeper ids. Sleeper's own directory has
 * an `espn_id` field, but for this league it was blank for three in four
 * rostered players, Drake London and Jaylen Waddle among them, so it cannot
 * be relied on alone.
 *
 * ── How a match is made, in order ────────────────────────────────────────────
 *
 *   1. Sleeper's espn_id, when present and the athlete exists at ESPN.
 *   2. Normalised name and team. Normalising strips punctuation and suffixes,
 *      so "Marvin Harrison Jr." and "D.K. Metcalf" match ESPN's spelling.
 *   3. Normalised name and position, for a player who changed teams more
 *      recently than one of the two directories noticed.
 *
 * A name that maps to two athletes at any step is left unmatched rather than
 * guessed. A wrong link would show somebody else's plays as yours, which is
 * worse than showing none.
 */

import { getPlayersDirectory } from '@/lib/playerStats';
import { getRedis } from '@/lib/redisClient';
import { espnAthletes, espnTeam, type EspnAthlete } from './espn';

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
export function normName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'’-]/g, '')
    .replace(SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Positions that mean the same player under two vocabularies. */
const POS_ALIAS: Record<string, string> = { PK: 'K', FB: 'RB' };
const pos = (p: string) => POS_ALIAS[p] ?? p;

export interface Crosswalk {
  /** Sleeper id to ESPN id. */
  toEspn: Map<string, string>;
  /** ESPN id to Sleeper id. */
  toSleeper: Map<string, string>;
  /** How each link was made, for checking coverage. */
  method: Map<string, 'sleeper' | 'name+team' | 'name+pos'>;
}

const KEY = 'lp_espn_xwalk_v1';
const TTL_MS = 12 * 60 * 60 * 1000;
let memo: { at: number; value: Crosswalk } | null = null;

function fromPairs(pairs: [string, string, string][]): Crosswalk {
  const toEspn = new Map<string, string>(), toSleeper = new Map<string, string>(), method = new Map<string, any>();
  for (const [s, e, m] of pairs) { toEspn.set(s, e); toSleeper.set(e, s); method.set(s, m); }
  return { toEspn, toSleeper, method };
}

/**
 * Build the crosswalk for a set of Sleeper ids, normally everyone on a roster
 * in the league. Restricting to rostered players keeps it small and is all
 * the live views need.
 */
export async function buildCrosswalk(sleeperIds: string[]): Promise<Crosswalk> {
  const [players, athletes] = await Promise.all([getPlayersDirectory(), espnAthletes()]);
  const byId = new Map(athletes.map(a => [a.id, a]));

  const index = (key: (a: EspnAthlete) => string) => {
    const m = new Map<string, EspnAthlete[]>();
    for (const a of athletes) {
      const k = key(a);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  };
  const byNameTeam = index(a => `${normName(a.name)}|${a.team}`);
  const byNamePos = index(a => `${normName(a.name)}|${pos(a.position)}`);
  const unique = (list?: EspnAthlete[]) => (list && list.length === 1 ? list[0] : null);

  const pairs: [string, string, string][] = [];
  for (const sid of new Set(sleeperIds)) {
    const p = players[sid];
    // Team defences have no single athlete to follow.
    if (!p || p.position === 'DEF') continue;
    const name = normName(p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '));
    const team = espnTeam(p.team);

    if (p.espn_id && byId.has(String(p.espn_id))) { pairs.push([sid, String(p.espn_id), 'sleeper']); continue; }
    const a = (team && unique(byNameTeam.get(`${name}|${team}`))) || unique(byNamePos.get(`${name}|${pos(p.position ?? '')}`));
    if (a) pairs.push([sid, a.id, team && unique(byNameTeam.get(`${name}|${team}`)) ? 'name+team' : 'name+pos']);
  }
  return fromPairs(pairs);
}

/** The crosswalk, cached in memory and in Redis for twelve hours. */
export async function crosswalkFor(sleeperIds: string[]): Promise<Crosswalk> {
  if (memo && Date.now() - memo.at < TTL_MS && sleeperIds.every(id => memo!.value.toEspn.has(id) || !id)) {
    return memo.value;
  }
  const redis = getRedis().client;
  if (redis && !memo) {
    try {
      const raw = await redis.get(KEY);
      const stored = raw ? JSON.parse(raw) as { at: number; pairs: [string, string, string][] } : null;
      if (stored && Date.now() - stored.at < TTL_MS) {
        const value = fromPairs(stored.pairs);
        memo = { at: stored.at, value };
        // Rosters change; only reuse it if it covers the players asked about.
        const missing = sleeperIds.filter(id => !value.toEspn.has(id)).length;
        if (missing <= 3) return value;
      }
    } catch { /* rebuild */ }
  }
  const value = await buildCrosswalk(sleeperIds);
  memo = { at: Date.now(), value };
  if (redis) {
    const pairs = [...value.toEspn.entries()].map(([s, e]) => [s, e, value.method.get(s)!] as [string, string, string]);
    redis.set(KEY, JSON.stringify({ at: memo.at, pairs })).catch(() => {});
  }
  return value;
}
