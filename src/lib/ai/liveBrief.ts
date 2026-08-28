import { getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';
import type { SleeperMatchup } from '@/types/sleeper';

/**
 * A snapshot of the week currently being played.
 *
 * Everything here is read from Sleeper at call time, and nothing is inferred
 * that Sleeper does not actually say. In particular there is no notion of an
 * NFL game clock: Sleeper's matchup feed exposes fantasy points and nothing
 * about which real games have kicked off. So "are games underway" is answered
 * with evidence rather than a guess, by asking whether anyone has scored.
 *
 * That matters more than it sounds. A writer told "games are in progress" on a
 * bye-heavy Sunday morning will happily invent a fourth-quarter comeback.
 */

export interface LiveTeam {
  rosterId: number;
  teamName: string;
  manager: string;
  points: number;
  /** Starters with a non-zero score. */
  played: number;
  /** Starters still on zero, which before Monday night usually means yet to play. */
  yetToScore: number;
  /** The starters carrying the score, best first. */
  topScorers: { name: string; position: string; points: number }[];
}

export interface LiveMatchup {
  matchupId: number;
  teams: LiveTeam[];
  /** Absolute points between the two sides. */
  margin: number;
  /** Team name currently ahead, or null when level. */
  leader: string | null;
}

export interface LiveBrief {
  season: string;
  week: number;
  seasonType: string;
  matchups: LiveMatchup[];
  /** True when at least one point has been scored anywhere in the league. */
  anyScoring: boolean;
  /** Total starters across the league still on zero. */
  yetToScore: number;
  /** Rendered for a prompt. */
  text: string;
}

/** How many names to name per team. Enough to be specific, not a box score. */
const TOP_N = 3;

function fmt(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '');
}

/** "1 starter", "2 starters". */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Build the live snapshot for the current NFL week.
 *
 * Returns null when there is no meaningful week to describe, which is every
 * day of the offseason and preseason.
 */
export async function buildLiveBrief(): Promise<LiveBrief | null> {
  const leagueId = await getCurrentLeagueId();
  const nflState = await getNFLState();
  const week = Number(nflState?.week ?? 0);
  const seasonType = String(nflState?.season_type ?? '');

  // Only the regular season and the postseason have games worth covering.
  if (!week || (seasonType !== 'regular' && seasonType !== 'post')) return null;

  return buildLiveBriefFor(leagueId, week, String(nflState?.season ?? ''), seasonType);
}

/**
 * The snapshot for one specific league, week and season.
 *
 * Split out so the rendering can be exercised against a week that has actually
 * been played. In the offseason `buildLiveBrief` correctly returns null, which
 * would otherwise leave all of this untestable until September.
 */
export async function buildLiveBriefFor(
  leagueId: string,
  week: number,
  season: string,
  seasonType: string,
): Promise<LiveBrief | null> {
  const nflState = { season, week } as { season: string; week: number };

  const [raw, rosters, users, players] = await Promise.all([
    getLeagueMatchups(leagueId, week),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
  ]);

  if (!Array.isArray(raw) || !raw.length) return null;

  const userById = new Map(users.map(u => [u.user_id, u]));
  const rosterMeta = new Map<number, { teamName: string; manager: string }>();
  for (const r of rosters as any[]) {
    const u = userById.get(r.owner_id);
    rosterMeta.set(Number(r.roster_id), {
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      manager: u?.display_name || 'Unknown',
    });
  }

  const toTeam = (m: SleeperMatchup): LiveTeam => {
    const meta = rosterMeta.get(Number(m.roster_id));
    const starters = Array.isArray(m.starters) ? m.starters : [];
    const pts = m.players_points ?? {};

    const scored = starters
      // Sleeper writes "0" into an empty starter slot; it is not a player.
      .filter(id => id && id !== '0')
      .map(id => ({
        name: players[id]?.full_name
          ?? [players[id]?.first_name, players[id]?.last_name].filter(Boolean).join(' ')
          ?? id,
        position: players[id]?.position ?? '',
        points: Number(pts[id] ?? 0),
      }));

    return {
      rosterId: Number(m.roster_id),
      teamName: meta?.teamName ?? `Roster ${m.roster_id}`,
      manager: meta?.manager ?? 'Unknown',
      points: Number(m.points ?? 0),
      played: scored.filter(s => s.points !== 0).length,
      yetToScore: scored.filter(s => s.points === 0).length,
      topScorers: scored
        .filter(s => s.points !== 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, TOP_N),
    };
  };

  const byMatchup = new Map<number, SleeperMatchup[]>();
  for (const m of raw) {
    const id = Number(m.matchup_id);
    if (!Number.isFinite(id)) continue;
    if (!byMatchup.has(id)) byMatchup.set(id, []);
    byMatchup.get(id)!.push(m);
  }

  const matchups: LiveMatchup[] = [...byMatchup.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([matchupId, pair]) => {
      const teams = pair.map(toTeam).sort((a, b) => b.points - a.points);
      const margin = teams.length === 2 ? Math.abs(teams[0].points - teams[1].points) : 0;
      return {
        matchupId,
        teams,
        margin,
        leader: teams.length === 2 && margin > 0 ? teams[0].teamName : null,
      };
    });

  const anyScoring = matchups.some(m => m.teams.some(t => t.points > 0));
  const yetToScore = matchups.reduce(
    (n, m) => n + m.teams.reduce((k, t) => k + t.yetToScore, 0), 0);

  const lines: string[] = [
    `LIVE SCOREBOARD, week ${week} of ${nflState?.season ?? ''}:`,
    anyScoring
      ? `  Scoring has started. ${plural(yetToScore, 'starter')} across the league still on zero.`
      : '  NOTHING has been scored yet this week. No game has produced a fantasy point.',
    '',
  ];

  for (const m of matchups) {
    const [a, b] = m.teams;
    if (!a) continue;
    if (!b) {
      lines.push(`  ${a.teamName}: ${fmt(a.points)} (bye or unpaired)`);
      continue;
    }
    lines.push(
      `  ${a.teamName} ${fmt(a.points)} vs ${b.teamName} ${fmt(b.points)}` +
      (m.margin > 0 ? `  [${a.teamName} by ${fmt(m.margin)}]` : '  [level]'),
    );
    for (const t of [a, b]) {
      const top = t.topScorers.length
        ? t.topScorers.map(s => `${s.name}${s.position ? ` (${s.position})` : ''} ${fmt(s.points)}`).join(', ')
        : 'nobody has scored';
      lines.push(`      ${t.teamName}: ${top}. ${plural(t.yetToScore, 'starter')} yet to score.`);
    }
  }

  lines.push(
    '',
    'RULES FOR USING THIS SCOREBOARD:',
    '  These are FANTASY points, already final for any player whose real game has ended.',
    '  Sleeper does not report NFL game clocks, so you do not know what quarter any game',
    '  is in. Never invent a score, a time remaining, a drive, or a real-world play.',
    '  A starter on zero has either not played yet or was shut out; say "yet to score",',
    '  never "injured", "benched" or anything else you cannot see here.',
  );

  return {
    season: String(nflState?.season ?? ''),
    week,
    seasonType,
    matchups,
    anyScoring,
    yetToScore,
    text: lines.join('\n'),
  };
}

/** One scheduled fantasy fixture, before it is played. */
export interface UpcomingGame {
  teamA: string;
  teamB: string;
  recordA: string;
  recordB: string;
}

/**
 * The fixtures for an upcoming week, with each side's record so a preview can
 * argue from something. Sleeper publishes the pairings well ahead of kickoff,
 * with every score still at zero, so this reads the schedule and nothing else.
 */
export async function buildUpcomingMatchups(week: number): Promise<{
  week: number;
  games: UpcomingGame[];
  text: string;
} | null> {
  if (!week || week > 18) return null;
  const leagueId = await getCurrentLeagueId();

  const [raw, rosters, users] = await Promise.all([
    getLeagueMatchups(leagueId, week),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!Array.isArray(raw) || !raw.length) return null;

  const userById = new Map(users.map(u => [u.user_id, u]));
  const meta = new Map<number, { teamName: string; record: string }>();
  for (const r of rosters as any[]) {
    const u = userById.get(r.owner_id);
    const s = r.settings ?? {};
    meta.set(Number(r.roster_id), {
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      record: `${s.wins ?? 0}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ''}`,
    });
  }

  const pairs = new Map<number, number[]>();
  for (const m of raw) {
    const id = Number(m.matchup_id);
    if (!Number.isFinite(id)) continue;
    if (!pairs.has(id)) pairs.set(id, []);
    pairs.get(id)!.push(Number(m.roster_id));
  }

  const games: UpcomingGame[] = [...pairs.values()]
    .filter(ids => ids.length === 2)
    .map(([a, b]) => ({
      teamA: meta.get(a)?.teamName ?? `Roster ${a}`,
      teamB: meta.get(b)?.teamName ?? `Roster ${b}`,
      recordA: meta.get(a)?.record ?? '0-0',
      recordB: meta.get(b)?.record ?? '0-0',
    }));

  if (!games.length) return null;

  return {
    week,
    games,
    text: [
      `WEEK ${week} FIXTURES, not yet played:`,
      ...games.map(g => `  ${g.teamA} (${g.recordA}) vs ${g.teamB} (${g.recordB})`),
      '',
      `  Preview EVERY fixture above, all ${games.length} of them, and pick a winner for each.`,
      '  These have not been played. No score exists. Do not report one.',
    ].join('\n'),
  };
}
