/**
 * Finding an ESPN league before it has a site: for sign-up, checkout and the
 * operator's "add a league". Talks to ESPN directly (nothing is kept yet) and
 * describes the league the way sign-up shows a Sleeper one.
 */

import { espnLeagueKey } from '../ids';
import { EspnError, fetchSeason, type EspnCredentials } from './client';
import { translateBase } from './translate';

/**
 * An ESPN league id from what someone pastes: the number itself, or any
 * ESPN fantasy football URL with `leagueId=` in it.
 */
export function parseEspnInput(q: string): string | null {
  const s = q.trim();
  if (/^\d{1,12}$/.test(s)) return s;
  const m = /[?&]leagueId=(\d{1,12})/i.exec(s);
  return m ? m[1] : null;
}

export interface EspnFound {
  leagueId: string;
  espnLeagueId: string;
  name: string;
  season: string;
  avatar: null;
  teams: number;
  format: string;
  scoring: string;
  status: string;
}

export type EspnFindResult =
  | { ok: true; league: EspnFound }
  | { ok: false; reason: 'private' | 'bad_credentials' | 'not_found' | 'unavailable' };

/**
 * The league's newest season on ESPN: this year's if it has been created,
 * otherwise last year's.
 */
export async function findEspnLeague(espnLeagueId: string, creds: EspnCredentials | null): Promise<EspnFindResult> {
  const year = new Date().getFullYear();
  for (const season of [year, year - 1]) {
    try {
      const raw = await fetchSeason(espnLeagueId, season, creds);
      const { league } = translateBase(raw, id => `espn_${id}`);
      const rec = Number(league.scoring_settings.rec ?? 0);
      return {
        ok: true,
        league: {
          leagueId: espnLeagueKey(espnLeagueId, season),
          espnLeagueId,
          name: league.name,
          season: league.season,
          avatar: null,
          teams: league.total_rosters,
          format: league.settings.type === 1 ? 'Keeper' : 'Redraft',
          scoring: rec >= 1 ? 'PPR' : rec >= 0.5 ? 'Half PPR' : 'Standard',
          status: league.status,
        },
      };
    } catch (err) {
      if (!(err instanceof EspnError)) return { ok: false, reason: 'unavailable' };
      if (err.kind === 'not_found') continue;
      if (err.kind === 'auth') return { ok: false, reason: creds ? 'bad_credentials' : 'private' };
      return { ok: false, reason: 'unavailable' };
    }
  }
  return { ok: false, reason: 'not_found' };
}

export const FIND_MESSAGES: Record<Exclude<EspnFindResult, { ok: true }>['reason'], string> = {
  private: 'This ESPN league is private. Add your ESPN cookies below so we can read it.',
  bad_credentials: 'ESPN did not accept those cookies. Copy them again while logged in to ESPN.',
  not_found: 'No ESPN football league with that ID this season or last.',
  unavailable: 'ESPN is not answering right now. Try again in a minute.',
};
