/**
 * Which NFL games to have on, and why.
 *
 * ── Leverage ─────────────────────────────────────────────────────────────────
 *
 * A game matters to you in proportion to how much it can move your fantasy
 * matchup, not in proportion to how many of your players are in it. Three
 * backups in a blowout matter less than one quarterback in a shootout.
 *
 * So for each NFL game: take your starters in it and your opponent's, and
 * ask the forecast model two questions. What is your win chance if this game
 * goes well for you (your players there finish about one standard deviation
 * above expectation, theirs one below)? And if it goes badly? The gap is the
 * leverage: "this game is worth 31 points of win probability to you". It uses
 * the same calibrated per-player spreads as the win chance on every matchup
 * card, so the guide and the forecast can never disagree about what matters.
 *
 * A finished game has no leverage left, whatever happened in it, and drops
 * down the list on its own.
 *
 * With no team chosen, games are ranked by their leverage summed over every
 * matchup in the league: the games the whole league should have on.
 */

import { weekForecasts, type FixtureForecast } from '@/lib/sim/weekForecasts';
import { finalDistribution, forecastMatchup, type StarterLine } from '@/lib/sim/matchupOdds';
import type { Calibration } from '@/lib/sim/calibration';
import { espnScoreboard, espnTeam, type LiveGame } from './espn';

/** One standard deviation either way: a good day and a bad one, not a fluke. */
const Z = 1.0;

export interface WatchPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  phase: StarterLine['phase'];
  points: number | null;
  projected: number | null;
  /** Their team has the ball right now. */
  onOffense: boolean;
}

export interface WatchGame extends LiveGame {
  /** Win probability this game can swing for the chosen team, 0 to 1. */
  leverage: number;
  /** The same, summed over every matchup in the league. */
  leagueLeverage: number;
  mine: WatchPlayer[];
  theirs: WatchPlayer[];
  /** League starters in the game, for when no team is chosen. */
  leagueStarters: number;
  /** Your team has the ball inside the 20. */
  hot: boolean;
}

export interface WatchGuide {
  season: string;
  week: number;
  me: { userId: string; teamName: string; avatar: string } | null;
  opponent: { userId: string; teamName: string; avatar: string } | null;
  winProb: number | null;
  /** Every team, for the picker. */
  teams: { userId: string; teamName: string; avatar: string }[];
  games: WatchGame[];
  updatedAt: string;
}

/** Fix a set of players at a quantile of their final score. */
function pinned(lines: StarterLine[], ids: Set<string>, z: number, c: Calibration): StarterLine[] {
  return lines.map(l => {
    if (!ids.has(l.playerId)) return l;
    const d = finalDistribution(l, c);
    if (!d) return l;
    return { ...l, phase: 'played', actual: Math.max(0, d.mean + z * d.sd) };
  });
}

/**
 * Win probability for side A that one game's players can swing.
 * `game` is the set of ESPN team codes playing in it.
 */
function swing(f: FixtureForecast, inGame: (l: StarterLine) => boolean): number {
  const [la, lb] = f.lines ?? [[], []];
  const c = f.forecast.calibration;
  const a = new Set(la.filter(inGame).map(l => l.playerId));
  const b = new Set(lb.filter(inGame).map(l => l.playerId));
  if (!a.size && !b.size) return 0;
  const good = forecastMatchup(pinned(la, a, Z, c), pinned(lb, b, -Z, c), c).aWinProb;
  const bad = forecastMatchup(pinned(la, a, -Z, c), pinned(lb, b, Z, c), c).aWinProb;
  return Math.max(0, good - bad);
}

function toWatchPlayer(l: StarterLine, possession: string | null): WatchPlayer {
  const team = espnTeam(l.nflTeam) ?? '';
  return {
    playerId: l.playerId, name: l.name, position: l.position, nflTeam: team,
    phase: l.phase, points: l.actual, projected: l.projected,
    onOffense: Boolean(possession && team === possession),
  };
}

export async function watchGuide(
  leagueId: string, season: string, week: number, userId: string | null,
): Promise<WatchGuide | null> {
  const [slate, scoreboard] = await Promise.all([
    weekForecasts(leagueId, season, week, true),
    espnScoreboard(),
  ]);
  if (!slate) return null;

  const teams = slate.fixtures.flatMap(f => [f.a, f.b])
    .map(t => ({ userId: t.userId, teamName: t.teamName, avatar: t.avatar }))
    .sort((x, y) => x.teamName.localeCompare(y.teamName));

  const mine = userId ? slate.fixtures.find(f => f.a.userId === userId || f.b.userId === userId) ?? null : null;
  const iAmA = mine ? mine.a.userId === userId : true;

  const games: WatchGame[] = scoreboard.map(g => {
    const codes = new Set([g.home.abbr, g.away.abbr]);
    const inGame = (l: StarterLine) => codes.has(espnTeam(l.nflTeam) ?? '');

    const leagueLeverage = slate.fixtures.reduce((t, f) => t + swing(f, inGame), 0);
    const leagueStarters = slate.fixtures.reduce((t, f) =>
      t + (f.lines?.[0].filter(inGame).length ?? 0) + (f.lines?.[1].filter(inGame).length ?? 0), 0);

    let leverage = 0, me: WatchPlayer[] = [], them: WatchPlayer[] = [];
    if (mine) {
      leverage = swing(mine, inGame);
      const [la, lb] = mine.lines ?? [[], []];
      const [myLines, theirLines] = iAmA ? [la, lb] : [lb, la];
      me = myLines.filter(inGame).map(l => toWatchPlayer(l, g.possession));
      them = theirLines.filter(inGame).map(l => toWatchPlayer(l, g.possession));
    }
    return {
      ...g, leverage, leagueLeverage, leagueStarters, mine: me, theirs: them,
      hot: g.state === 'in' && g.redZone && me.some(p => p.onOffense),
    };
  });

  // Live first, then upcoming, then finished; within each, by what is at stake.
  const stateRank = { in: 0, pre: 1, post: 2 } as const;
  const stake = (g: WatchGame) => (mine ? g.leverage : g.leagueLeverage);
  games.sort((x, y) =>
    stateRank[x.state] - stateRank[y.state]
    || stake(y) - stake(x)
    || y.leagueStarters - x.leagueStarters
    || x.kickoff.localeCompare(y.kickoff));

  const meT = mine ? (iAmA ? mine.a : mine.b) : null;
  const oppT = mine ? (iAmA ? mine.b : mine.a) : null;
  return {
    season, week,
    me: meT ? { userId: meT.userId, teamName: meT.teamName, avatar: meT.avatar } : null,
    opponent: oppT ? { userId: oppT.userId, teamName: oppT.teamName, avatar: oppT.avatar } : null,
    winProb: mine ? (iAmA ? mine.forecast.aWinProb : 1 - mine.forecast.aWinProb) : null,
    teams, games,
    updatedAt: new Date().toISOString(),
  };
}

