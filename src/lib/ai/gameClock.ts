/**
 * What day it is, and which games are actually over.
 *
 * Every AI surface, the chat assistant and each media personality, reads this
 * before it writes. It exists because they were writing about results that did
 * not exist yet.
 *
 * ── The failure it fixes ─────────────────────────────────────────────────────
 *
 * The league brief used to list "most recent scores" by taking the latest week
 * where anyone had points, with no indication of whether those points were
 * settled. On a Monday evening that is fifteen finished NFL games and one still
 * to kick off, so every fantasy matchup with a Monday night starter was
 * presented to the writers as a final score. They had no date either, so they
 * could not tell Monday night from Tuesday morning.
 *
 * Game status now comes from the NFL schedule, which is authoritative, and each
 * fantasy matchup is marked FINAL only when every starter on both sides has
 * finished playing. That is a per-matchup judgement, not a per-week one: most
 * of a league can be settled while one matchup still hinges on Monday night.
 */

import { getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { weekGames, phaseOf, teamGameStatus, hasPlayed, type WeekPhase } from '@/lib/nflSchedule';
import { getLeagueRosters } from '@/lib/api';
import { getPlayersDirectory } from '@/lib/playerStats';
import { weekForecasts, type FixtureForecast } from '@/lib/sim/weekForecasts';

/** NFL time. Kickoffs, "tonight" and "yesterday" all mean Eastern. */
const TZ = 'America/New_York';

export interface ClockFixture {
  teamA: string;
  teamB: string;
  pointsA: number;
  pointsB: number;
  settled: boolean;
  /** Starters on each side whose games have not finished, by name. */
  stillToPlayA: string[];
  stillToPlayB: string[];
  /** Team ahead, or null when level. */
  leader: string | null;
  margin: number;
  /**
   * The leader's chance of holding on, from the live forecast. Lets a writer
   * say "all but sealed" about a 79 point lead with one player left, which is
   * accurate, without ever calling it final, which would not be.
   */
  leaderWinProb: number | null;
}

export interface GameClock {
  /** e.g. "Monday, September 14, 2026" */
  dateLabel: string;
  weekday: string;
  /** e.g. "7:13 PM" Eastern. */
  timeLabel: string;
  season: string;
  week: number;
  phase: WeekPhase;
  nflFinal: number;
  nflTotal: number;
  /** NFL games in the week that have not finished. */
  nflRemaining: { away: string; home: string; day: string }[];
  fixtures: ClockFixture[];
  /**
   * Every ROSTERED player, starter or bench, whose NFL game this week has
   * finished. For fact checking.
   *
   * Roster-wide rather than starters only, because writers name bench players
   * too: the error that prompted this was a claim that a benched quarterback
   * "has not played yet" when his Sunday game was over. A starters-only list
   * could not see him. Players on a bye are in neither list.
   */
  playedNames: string[];
  /** Every rostered player whose NFL game this week has not finished. */
  stillToPlayNames: string[];
  /** Rendered for a prompt. */
  text: string;
}

function easternNow(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit',
  }).format(now);
  return { date, weekday, time };
}

/** "2026-09-14" to "Monday Sep 14". The schedule gives a date but no kickoff time. */
function dayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric',
  }).format(d);
}

function toClockFixture(f: FixtureForecast): ClockFixture {
  const [la, lb] = f.lines ?? [[], []];
  const left = (lines: typeof la) => lines.filter(l => l.phase === 'upcoming').map(l => l.name);
  const pa = f.forecast.a.pointsSoFar, pb = f.forecast.b.pointsSoFar;
  const margin = Math.abs(pa - pb);
  const leaderIsA = pa > pb;
  return {
    teamA: f.a.teamName,
    teamB: f.b.teamName,
    pointsA: pa,
    pointsB: pb,
    settled: f.forecast.settled,
    stillToPlayA: left(la),
    stillToPlayB: left(lb),
    leader: margin > 0.001 ? (leaderIsA ? f.a.teamName : f.b.teamName) : null,
    margin,
    leaderWinProb: margin > 0.001
      ? (leaderIsA ? f.forecast.aWinProb : 1 - f.forecast.aWinProb)
      : null,
  };
}

const f1 = (n: number) => n.toFixed(1);

/**
 * A forecast phrased for a writer. Words rather than a bare percentage, with the
 * number attached, so the model neither overstates a 60% lead nor undersells a
 * 99% one.
 */
function outlook(p: number): string {
  // "win chance X" rather than "a X chance", which read "a over 99% chance".
  const pct = p >= 0.995 ? 'over 99%' : `${Math.round(p * 100)}%`;
  if (p >= 0.97) return `win chance ${pct}, all but sealed`;
  if (p >= 0.8)  return `win chance ${pct}, in control`;
  if (p >= 0.6)  return `win chance ${pct}, favoured but not safe`;
  return `win chance ${pct}, genuinely in the balance`;
}

/**
 * Short memo, because every brief read rebuilds the clock. A minute is small
 * enough that a finished game or the time label are never meaningfully stale,
 * and large enough that a burst of generations does not redo the work.
 */
let memo: { clock: GameClock; at: number } | null = null;
const CLOCK_TTL_MS = 60 * 1000;

export async function buildGameClock(now = new Date()): Promise<GameClock> {
  if (memo && now.getTime() - memo.at < CLOCK_TTL_MS) {
    // Keep the date and time current even when the game data is reused.
    const t = easternNow(now);
    if (t.time === memo.clock.timeLabel) return memo.clock;
    const refreshed = { ...memo.clock, dateLabel: t.date, weekday: t.weekday, timeLabel: t.time };
    refreshed.text = renderClock(refreshed, refreshed.nflTotal > 0 || refreshed.fixtures.length > 0);
    return refreshed;
  }
  const clock = await computeClock(now);
  memo = { clock, at: now.getTime() };
  return clock;
}

/**
 * Build the clock for the league's current NFL week.
 *
 * If the current week has not kicked off, the previous week is described
 * instead, since that is the most recent thing with results. Returns a
 * date-only clock in the offseason, which is still worth giving a writer.
 */
async function computeClock(now: Date): Promise<GameClock> {
  const { date, weekday, time } = easternNow(now);
  const nflState: any = await getNFLState().catch(() => null);
  const season = String(nflState?.season ?? '');
  const seasonType = String(nflState?.season_type ?? '');
  const currentWeek = Number(nflState?.week ?? 0);

  const empty: GameClock = {
    dateLabel: date, weekday, timeLabel: time, season, week: currentWeek,
    phase: 'upcoming', nflFinal: 0, nflTotal: 0, nflRemaining: [], fixtures: [],
    playedNames: [], stillToPlayNames: [],
    text: '',
  };

  const inSeason = currentWeek > 0 && (seasonType === 'regular' || seasonType === 'post');
  if (!inSeason) {
    empty.text = renderClock(empty, false);
    return empty;
  }

  // Describe the current week once it has started, otherwise the one before.
  let week = currentWeek;
  let games = await weekGames(season, week);
  if (phaseOf(games) === 'upcoming' && currentWeek > 1) {
    week = currentWeek - 1;
    games = await weekGames(season, week);
  }
  const phase = phaseOf(games);

  const leagueId = await getCurrentLeagueId();
  const forecasts = await weekForecasts(leagueId, season, week, true).catch(() => null);

  const done = games.filter(g => g.status === 'complete' || g.status === 'canceled');
  const clock: GameClock = {
    ...empty,
    week,
    phase,
    nflFinal: done.length,
    nflTotal: games.length,
    nflRemaining: games
      .filter(g => g.status !== 'complete' && g.status !== 'canceled')
      .map(g => ({ away: g.away, home: g.home, day: dayLabel(g.date) })),
    fixtures: (forecasts?.fixtures ?? []).map(toClockFixture),
    playedNames: [],
    stillToPlayNames: [],
  };
  // Game status for everyone on a roster, not just this week's starters.
  try {
    const [rosters, players, status] = await Promise.all([
      getLeagueRosters(leagueId),
      getPlayersDirectory(),
      teamGameStatus(season, week),
    ]);
    const seen = new Set<string>();
    for (const r of rosters as any[]) {
      for (const id of (r.players ?? []) as string[]) {
        if (!id || id === '0' || seen.has(id)) continue;
        seen.add(id);
        const p = players?.[id];
        const team: string | undefined = p?.team;
        if (!team) continue;
        const gs = status.get(team);
        if (gs === undefined) continue;            // bye week: neither list
        const name = p?.full_name
          || [p?.first_name, p?.last_name].filter(Boolean).join(' ');
        if (!name) continue;
        (hasPlayed(gs) ? clock.playedNames : clock.stillToPlayNames).push(name);
      }
    }
  } catch {
    // Without this the checker simply has less to go on; the prompt still has
    // the per-matchup status.
  }
  clock.text = renderClock(clock, true);
  return clock;
}

function renderClock(c: GameClock, inSeason: boolean): string {
  const lines: string[] = [
    `TODAY IS ${c.dateLabel.toUpperCase()}, ${c.timeLabel} Eastern.`,
    '  Use this for every reference to time: "tonight", "yesterday", "this weekend",',
    '  "Sunday", "Monday night". Do not assume any other day.',
  ];
  if (!inSeason) return lines.join('\n');

  lines.push('', `GAME STATUS, WEEK ${c.week} OF ${c.season} (from the NFL schedule, authoritative):`);

  if (c.phase === 'final') {
    lines.push(`  All ${c.nflTotal} NFL games this week are final. Every result below is settled.`);
  } else if (c.phase === 'upcoming') {
    lines.push('  No NFL game this week has been played yet. There are NO results and NO scores.');
  } else {
    lines.push(
      `  ${c.nflFinal} of ${c.nflTotal} NFL games are final. THE WEEK IS NOT OVER.`,
      `  Still to play: ${c.nflRemaining.map(g => `${g.away} @ ${g.home} (${g.day})`).join('; ')}.`,
    );
  }

  if (c.fixtures.length) {
    lines.push('', 'FANTASY MATCHUPS THIS WEEK:');
    for (const x of c.fixtures) {
      const score = `${x.teamA} ${f1(x.pointsA)} vs ${x.teamB} ${f1(x.pointsB)}`;
      if (x.settled) {
        lines.push(x.leader
          ? `  FINAL: ${score}. ${x.leader} won by ${f1(x.margin)}.`
          : `  FINAL: ${score}. Tied.`);
      } else {
        const waiting = [
          x.stillToPlayA.length ? `${x.teamA} still to play: ${x.stillToPlayA.join(', ')}` : '',
          x.stillToPlayB.length ? `${x.teamB} still to play: ${x.stillToPlayB.join(', ')}` : '',
        ].filter(Boolean).join('. ');
        const state = x.leader
          ? `${x.leader} leads by ${f1(x.margin)}${x.leaderWinProb != null
              ? `, ${outlook(x.leaderWinProb)}` : ''}`
          : 'level';
        lines.push(`  IN PROGRESS (not decided): ${score}, ${state}. ${waiting}.`);
      }
    }
  }

  lines.push(
    '',
    'RULES FOR GAME STATUS. These override anything else in this context:',
    '  A fantasy matchup has a result ONLY if it is marked FINAL above.',
    '  Use "won", "lost", "beat", "final", "sealed", "clinched" ONLY for FINAL matchups.',
    '  For IN PROGRESS matchups the score is partial. Say "leads", "trails", "up by",',
    '  and name who is still to play. Never state a winner as fact or call it final.',
    '  The win chance shown is a forecast. When it is very high you may say a lead',
    '  looks safe or is all but sealed; when it is close, say it is still in the',
    '  balance. Either way it is not over until it is marked FINAL.',
    '  Players listed as still to play have not played. Never credit or blame them',
    '  for this week, and never invent a stat line for them.',
    '  You may write about games in progress, but always as in progress.',
  );
  return lines.join('\n');
}
