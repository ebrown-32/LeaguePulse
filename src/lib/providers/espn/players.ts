/**
 * ESPN fantasy player ids to Sleeper player ids.
 *
 * The app knows players by their Sleeper id (headshots, stats, projections,
 * news all key off it), so an ESPN league's players are translated to it.
 * Separate from src/lib/live/crosswalk.ts, which links the other way for
 * Game Day and is left exactly as it is.
 *
 * A match is made, in order, by:
 *   1. a team defence's pro team, which is Sleeper's id for that defence;
 *   2. the ESPN id Sleeper records for the player, when it has one (often
 *      blank, which is why there are further steps);
 *   3. normalised name and position, when exactly one Sleeper player has them;
 *   4. normalised name and NFL team, the same.
 * A name shared by two players is never guessed between. An unmatched player
 * keeps an `espn_<id>` id: the page shows them without a headshot rather than
 * showing someone else's.
 *
 * Pure: hand it ESPN's player list and Sleeper's directory.
 */

import { POSITION, PRO_TEAM, defenceTeam } from './translate.ts';

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;
export function normName(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'’-]/g, '')
    .replace(SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface EspnPlayerInfo { id: number; fullName: string; defaultPositionId: number; proTeamId: number }

export interface PlayerMapResult {
  /** ESPN id to Sleeper id, for every player that matched. */
  pairs: Record<string, string>;
  matched: number;
  unmatched: number;
}

export function buildPlayerMap(espn: EspnPlayerInfo[], sleeper: Record<string, any>): PlayerMapResult {
  const byEspnId = new Map<string, string>();
  const index = <K>(key: (p: any) => K | null) => {
    const m = new Map<K, string[]>();
    for (const [sid, p] of Object.entries(sleeper)) {
      const k = key(p);
      if (k === null) continue;
      m.set(k, [...(m.get(k) ?? []), sid]);
    }
    return m;
  };
  for (const [sid, p] of Object.entries(sleeper)) if (p?.espn_id) byEspnId.set(String(p.espn_id), sid);
  const nameOf = (p: any) => normName(p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' '));
  const byNamePos = index(p => (p?.position && p.position !== 'DEF' ? `${nameOf(p)}|${p.position}` : null));
  const byNameTeam = index(p => (p?.team && p.position !== 'DEF' ? `${nameOf(p)}|${p.team}` : null));
  const one = (l?: string[]) => (l && l.length === 1 ? l[0] : null);

  const pairs: Record<string, string> = {};
  let matched = 0, unmatched = 0;
  for (const e of espn) {
    const def = defenceTeam(e.id);
    let sid: string | null = def;
    if (!sid) sid = byEspnId.get(String(e.id)) ?? null;
    if (!sid) {
      const name = normName(e.fullName ?? '');
      const pos = POSITION[e.defaultPositionId];
      const team = PRO_TEAM[e.proTeamId];
      sid = (pos && one(byNamePos.get(`${name}|${pos}`))) || (team && one(byNameTeam.get(`${name}|${team}`))) || null;
    }
    if (sid) { pairs[String(e.id)] = sid; matched++; } else unmatched++;
  }
  return { pairs, matched, unmatched };
}

/** The lookup the translators take. */
export function playerIdFn(pairs: Record<string, string>): (espnPlayerId: number) => string {
  return id => pairs[String(id)] ?? defenceTeam(id) ?? `espn_${id}`;
}
