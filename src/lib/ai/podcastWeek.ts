/**
 * An earlier week of this season as it stood at the time, for a Desk Weekly look-back episode.
 *
 * The league brief (leagueBrief.ts) is the league today: its records, table and scores are the
 * latest. An episode about week 3 written from it would quote week 9's records. So this rebuilds
 * the week from the matchups themselves:
 *   - that week's results
 *   - the table after it (wins, losses, ties and points from weeks 1 to N, median games
 *     included where the league plays them; regular season only)
 *   - that week's moves, where the brief's transaction window still has them
 *
 * Server only.
 */

import { getLeagueMatchups, getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import type { BriefMatchup, BriefMove, LeagueBrief } from './leagueBrief';

export interface SnapshotTeam {
  teamName: string;
  manager: string;
  record: string;
  rank: number;
  pointsFor: number;
  topPlayers: { name: string; position: string; points: number | null }[];
}

export interface WeekSnapshot {
  week: number;
  games: BriefMatchup[];
  table: SnapshotTeam[];
  moves: BriefMove[];
  playoffs: boolean;
  /** For the writer: the week, its results, the table after it and its moves, in words. */
  text: string;
}

const round1 = (n: number) => Number(n.toFixed(1));

export async function weekSnapshot(brief: LeagueBrief, week: number): Promise<WeekSnapshot> {
  const leagueId = await getCurrentLeagueId();
  const [rosters, users] = await Promise.all([getLeagueRosters(leagueId), getLeagueUsers(leagueId)]);
  const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
  const nameOf = new Map<number, { team: string; manager: string }>(rosters.map((r: any) => {
    const u = userById.get(r.owner_id);
    return [r.roster_id, { team: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`, manager: u?.display_name ?? '' }];
  }));

  const weeks = await Promise.all(Array.from({ length: week }, (_, i) => getLeagueMatchups(leagueId, i + 1).catch(() => [] as any[])));

  const tally = new Map<number, { w: number; l: number; t: number; pf: number }>(rosters.map((r: any) => [r.roster_id, { w: 0, l: 0, t: 0, pf: 0 }]));
  const result = (id: number, a: number, b: number) => {
    const s = tally.get(id); if (!s) return;
    if (a > b) s.w++; else if (a < b) s.l++; else s.t++;
  };
  let games: BriefMatchup[] = [];

  weeks.forEach((ms: any[], i) => {
    const wk = i + 1;
    const regular = wk < brief.playoffWeekStart;
    const pairs = new Map<number, any[]>();
    for (const m of ms) if (m.matchup_id) pairs.set(m.matchup_id, [...(pairs.get(m.matchup_id) ?? []), m]);
    const played = [...pairs.values()].filter(p => p.length === 2 && (p[0].points > 0 || p[1].points > 0));

    if (regular) {
      for (const [a, b] of played) {
        result(a.roster_id, a.points ?? 0, b.points ?? 0);
        result(b.roster_id, b.points ?? 0, a.points ?? 0);
        for (const x of [a, b]) { const s = tally.get(x.roster_id); if (s) s.pf += x.points ?? 0; }
      }
      // The median game: everyone who played also plays the week's middle score.
      if (brief.medianMatch && played.length) {
        const scores = played.flat().map(m => m.points ?? 0).sort((x, y) => x - y);
        const mid = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
        for (const m of played.flat()) result(m.roster_id, m.points ?? 0, mid);
      }
    }
    if (wk === week) {
      games = played.map(([a, b]) => ({
        week: wk,
        home: { teamName: nameOf.get(a.roster_id)?.team ?? '?', points: round1(a.points ?? 0) },
        away: { teamName: nameOf.get(b.roster_id)?.team ?? '?', points: round1(b.points ?? 0) },
        margin: round1(Math.abs((a.points ?? 0) - (b.points ?? 0))),
      }));
    }
  });

  const table: SnapshotTeam[] = [...tally.entries()]
    .sort(([, x], [, y]) => (y.w - x.w) || (y.pf - x.pf))
    .map(([id, s], i) => ({
      teamName: nameOf.get(id)?.team ?? '?',
      manager: nameOf.get(id)?.manager ?? '',
      record: `${s.w}-${s.l}${s.t ? `-${s.t}` : ''}`,
      rank: i + 1,
      pointsFor: round1(s.pf),
      // Season-to-date player points would be today's, not that week's: left out.
      topPlayers: [],
    }));

  const moves = brief.recentMoves.filter(m => m.season === brief.season && m.week === week);
  const playoffs = week >= brief.playoffWeekStart;
  const tableWeek = Math.min(week, brief.playoffWeekStart - 1);

  const text = [
    `THIS EPISODE LOOKS BACK AT WEEK ${week} OF THE ${brief.season} SEASON${playoffs ? ' (A PLAYOFF WEEK)' : ''}, in ${brief.leagueName}.`,
    `Talk about it as that week, as if it had just finished. Nothing after week ${week} exists for this episode: no later results, records, trades or storylines.`,
    `${brief.totalTeams} teams, ${brief.playoffTeams} make the playoffs, which start in week ${brief.playoffWeekStart}.${brief.medianMatch ? ' Every team also plays the week\'s median score, so a week is two games and a record counts both.' : ''}`,
    '',
    `WEEK ${week} RESULTS (final):`,
    ...(games.length ? games.map(g => `- ${g.home.teamName} ${g.home.points}, ${g.away.teamName} ${g.away.points} (margin ${g.margin})`) : ['- none on record']),
    '',
    `STANDINGS AFTER WEEK ${tableWeek} (regular season, wins then points):`,
    ...table.map(t => `${t.rank}. ${t.teamName}${t.manager ? ` (${t.manager})` : ''}: ${t.record}, ${t.pointsFor} points`),
    '',
    `MOVES DURING WEEK ${week}:`,
    ...(moves.length ? moves.map(m => `- ${m.type}: ${m.summary}`) : ['- none on record (do not invent any)']),
  ].join('\n');

  return { week, games, table, moves, playoffs, text };
}
