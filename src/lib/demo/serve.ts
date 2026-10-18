/**
 * The demo league's answers to Sleeper API paths (see providers/leagueFetch.ts), from the
 * seasons data.ts plays out: the same paths and shapes as Sleeper, so every page reads the demo
 * as it reads any league. Made up, so served to anyone. Server only.
 */

import { parseDemoLeague } from '@/lib/providers/ids';
import { demoSeason, demoSeasonFinished, demoSeasons } from './data';

/** An answer, and whether it's from a finished season (it will never change). */
type Answer = { status: number; body: unknown; final?: boolean };
const ok = (body: unknown): Answer => ({ status: 200, body });
const missing: Answer = { status: 404, body: null };

export async function serveDemo(path: string): Promise<Answer> {
  const parts = path.split('?')[0].split('/').filter(Boolean);

  // user/<manager>/leagues/nfl/<season>: how the app finds the next season's league.
  if (parts[0] === 'user') {
    const season = Number(parts[4]);
    if (parts[2] !== 'leagues' || !season || !(await demoSeasons()).includes(season)) return ok([]);
    const s = await demoSeason(season);
    return ok(s ? [s.league] : []);
  }

  const season = parseDemoLeague(parts[1] ?? '');
  if (season == null) return missing;
  const [s, final] = await Promise.all([demoSeason(season), demoSeasonFinished(season)]);
  if (!s) return missing;
  const rest = parts.slice(2);
  const answer = (body: unknown): Answer => ({ status: 200, body, final });

  if (parts[0] === 'draft') {
    if (rest.length === 0) return answer(s.drafts[0]);
    if (rest[0] === 'picks') return answer(s.picks);
    if (rest[0] === 'traded_picks') return answer([]);
    return missing;
  }
  if (parts[0] !== 'league') return missing;

  const [what, arg] = rest;
  switch (what) {
    case undefined: return answer(s.league);
    case 'users': return answer(s.users);
    case 'rosters': return answer(s.rosters);
    case 'matchups': return answer(s.matchups[Number(arg)] ?? []);
    case 'transactions': return answer(s.transactions[Number(arg)] ?? []);
    case 'winners_bracket': return answer(s.winners_bracket);
    case 'losers_bracket': return answer(s.losers_bracket);
    case 'drafts': return answer(s.drafts);
    case 'traded_picks': return answer([]);
    default: return missing;
  }
}
