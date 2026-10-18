/**
 * The demo league's answers to Sleeper API paths (see providers/leagueFetch.ts), from the
 * seasons data.ts plays out: the same paths and shapes as Sleeper, so every page reads the demo
 * as it reads any league. Made up, so served to anyone. Server only.
 */

import { parseDemoLeague } from '@/lib/providers/ids';
import { demoSeason, demoSeasons } from './data';

type Answer = { status: number; body: unknown };
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
  const s = await demoSeason(season);
  if (!s) return missing;
  const rest = parts.slice(2);

  if (parts[0] === 'draft') {
    if (rest.length === 0) return ok(s.drafts[0]);
    if (rest[0] === 'picks') return ok(s.picks);
    if (rest[0] === 'traded_picks') return ok([]);
    return missing;
  }
  if (parts[0] !== 'league') return missing;

  const [what, arg] = rest;
  switch (what) {
    case undefined: return ok(s.league);
    case 'users': return ok(s.users);
    case 'rosters': return ok(s.rosters);
    case 'matchups': return ok(s.matchups[Number(arg)] ?? []);
    case 'transactions': return ok(s.transactions[Number(arg)] ?? []);
    case 'winners_bracket': return ok(s.winners_bracket);
    case 'losers_bracket': return ok(s.losers_bracket);
    case 'drafts': return ok(s.drafts);
    case 'traded_picks': return ok([]);
    default: return missing;
  }
}
