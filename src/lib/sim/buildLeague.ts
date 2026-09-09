/**
 * Assembles the league into the shape the simulation engine wants.
 *
 * Shared, deliberately. The Weekly Report used to carry its own Monte Carlo
 * with its own score model, which meant two pages could show two different
 * playoff odds for the same league, and the report's bracket did not know about
 * the two week championship. Both now read from here, so there is one answer.
 *
 * Nothing here invents a number: every input is either a real score Sleeper
 * recorded, a real Sleeper weekly projection, or a documented blend of the two
 * (see `lib/sim/strength.ts`).
 */

import { getAllLinkedLeagueIds } from '@/lib/api';
import { teamAvatar } from '@/lib/teamAvatar';
import { getPlayersDirectory } from '@/lib/playerStats';
import { weeklyProjectionsFor, fantasyPositions } from '@/lib/sim/weeklyProjections';
import {
  fitTeamStrength, poolResiduals, leagueBaseline, bestLineupTotal, type WeekScore,
} from '@/lib/sim/strength';
import type { SimLeague, SimTeam, SimGame, PlayedGame } from '@/lib/sim/types';

export interface SimMeta {
  seasonsOfHistory: number;
  residualSamples: number;
  leagueMean: number;
  leagueSd: number;
  projectedWeeks: number;
  maxWins: number;
}

export interface BuildResult {
  league: SimLeague;
  meta: SimMeta;
}

const BASE = 'https://api.sleeper.app/v1';

async function fetchJson<T>(url: string, opts: RequestInit, fallback: T, tries = 3): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return await r.json();
      if (r.status === 404) return fallback;
    } catch { /* retry */ }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 300 * (i + 1)));
  }
  return fallback;
}

interface SeasonRaw {
  leagueId: string;
  season: string;
  isCurrent: boolean;
  regularSeasonWeeks: number;
  playoffTeams: number;
  playoffRoundType: number;
  hasMedianGames: boolean;
  rosterSlots: string[];
  users: any[];
  rosters: any[];
  /** week -> matchup rows */
  weeks: Map<number, any[]>;
}

async function loadSeason(leagueId: string, isCurrent: boolean): Promise<SeasonRaw | null> {
  const [info, rosters, users] = await Promise.all([
    fetchJson<any>(`${BASE}/league/${leagueId}`, { next: { revalidate: 3600 } }, null),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 900 } }, []),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/users`, { next: { revalidate: 3600 } }, []),
  ]);
  if (!info || rosters.length === 0) return null;

  const regularSeasonWeeks = Math.max(1, (info.settings?.playoff_week_start || 15) - 1);
  const complete = info.status === 'complete';
  const opts: RequestInit = complete ? { next: { revalidate: 86400 } } : { cache: 'no-store' };

  const batches = await Promise.all(
    Array.from({ length: regularSeasonWeeks }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/matchups/${i + 1}`, opts, [])),
  );
  const weeks = new Map<number, any[]>();
  batches.forEach((rows, i) => weeks.set(i + 1, rows ?? []));

  return {
    leagueId,
    season: info.season,
    isCurrent,
    regularSeasonWeeks,
    playoffTeams: info.settings?.playoff_teams || 4,
    playoffRoundType: info.settings?.playoff_round_type ?? 0,
    hasMedianGames: !!info.settings?.league_average_match,
    rosterSlots: info.roster_positions || [],
    users, rosters, weeks,
  };
}

/**
 * Who owns each roster's first round pick in the given draft.
 *
 * Returns `originalRosterId -> currentOwnerRosterId`. Untraded picks map to
 * themselves. In dynasty this is not a detail: seven of this league's eight
 * 2027 firsts have changed hands, so a team's own projected slot is usually not
 * a pick they will actually make.
 */
async function firstRoundOwnership(
  leagueId: string, draftSeason: string, rosterIds: number[],
): Promise<Record<number, number>> {
  const own: Record<number, number> = {};
  for (const rid of rosterIds) own[rid] = rid;
  const traded = await fetchJson<any[]>(
    `${BASE}/league/${leagueId}/traded_picks`, { next: { revalidate: 900 } }, []);
  for (const p of traded ?? []) {
    if (String(p.season) !== draftSeason || Number(p.round) !== 1) continue;
    if (own[p.roster_id] === undefined) continue;
    own[p.roster_id] = p.owner_id;
  }
  return own;
}

/** A week counts as played once anybody in it has actually scored. */
function weekWasPlayed(rows: any[]): boolean {
  return rows.some(r => (r.points ?? 0) > 0);
}

export async function buildSimLeague(): Promise<BuildResult> {
  const currentLeagueId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!currentLeagueId) {
    throw new Error('NEXT_PUBLIC_LEAGUE_ID is not set');
  }

  const linked = await getAllLinkedLeagueIds(currentLeagueId);
  const seasons = (await Promise.all(
    linked.map(id => loadSeason(id, id === currentLeagueId)),
  )).filter((s): s is SeasonRaw => s !== null);

  const current = seasons.find(s => s.isCurrent)
    ?? seasons.sort((a, b) => Number(b.season) - Number(a.season))[0];
  if (!current) {
    throw new Error('No league seasons could be loaded');
  }

  // ── Real weekly scores, everywhere, keyed by manager ────────────────────────
  // Manager rather than roster id, because roster ids are per season and a
  // manager's history is the thing that actually carries forward.
  const history: WeekScore[] = [];
  const currentScoresByUser = new Map<string, number[]>();
  const priorScoresByUser   = new Map<string, number[]>();

  for (const s of seasons) {
    const userByRoster = new Map<number, string>(
      s.rosters.map(r => [r.roster_id as number, r.owner_id as string]));
    for (const [, rows] of s.weeks) {
      if (!weekWasPlayed(rows)) continue;
      for (const row of rows) {
        const uid = userByRoster.get(row.roster_id);
        const pts = row.points ?? 0;
        if (!uid || pts <= 0) continue;
        history.push({ userId: uid, season: s.season, score: pts });
        const bucket = s.isCurrent ? currentScoresByUser : priorScoresByUser;
        if (!bucket.has(uid)) bucket.set(uid, []);
        bucket.get(uid)!.push(pts);
      }
    }
  }

  const residuals = poolResiduals(history);
  const baseline  = leagueBaseline(history);

  // ── Current season: what has happened, and what is left ────────────────────
  const userById = new Map<string, any>(current.users.map(u => [u.user_id, u]));
  const played: PlayedGame[] = [];
  const remaining: SimGame[] = [];
  let weeksPlayed = 0;

  for (let wk = 1; wk <= current.regularSeasonWeeks; wk++) {
    const rows = current.weeks.get(wk) ?? [];
    const groups = new Map<number, any[]>();
    for (const row of rows) {
      if (row.matchup_id === null || row.matchup_id === undefined) continue;
      if (!groups.has(row.matchup_id)) groups.set(row.matchup_id, []);
      groups.get(row.matchup_id)!.push(row);
    }
    const done = weekWasPlayed(rows);
    if (done) weeksPlayed = wk;

    for (const g of groups.values()) {
      if (g.length !== 2) continue;
      const [a, b] = g;
      if (done) {
        played.push({
          week: wk,
          homeRosterId: a.roster_id, awayRosterId: b.roster_id,
          homeScore: a.points ?? 0,  awayScore: b.points ?? 0,
        });
      } else {
        remaining.push({ week: wk, homeRosterId: a.roster_id, awayRosterId: b.roster_id });
      }
    }
  }

  // ── Forward looking input: Sleeper's real weekly projections ───────────────
  // These come from api.sleeper.com, not the old api.sleeper.app/v1 host, whose
  // weekly path returns ADP noise with no points. Fetched once per remaining
  // week and reduced to a best-lineup total per roster, which is what makes bye
  // weeks visible: a player on a bye simply has no projection.
  const remainingWeeks = [...new Set(remaining.map(g => g.week))].sort((a, b) => a - b);
  const projByWeekByRoster = new Map<number, Map<number, number>>(); // week -> roster -> pts
  let directory: Record<string, any> = {};
  try {
    directory = await getPlayersDirectory();
    const positionOf = (id: string) => (directory?.[id]?.position as string) ?? null;
    const positions = fantasyPositions(current.rosterSlots);
    const projections = await weeklyProjectionsFor(current.season, remainingWeeks, positions);

    for (const wk of remainingWeeks) {
      const pts = projections.get(wk);
      if (!pts || pts.size === 0) continue;
      const byRoster = new Map<number, number>();
      for (const r of current.rosters) {
        const total = bestLineupTotal(
          r.players ?? [], positionOf,
          (id: string) => pts.get(id) ?? null,
          current.rosterSlots,
        );
        if (total !== null) byRoster.set(r.roster_id, total);
      }
      if (byRoster.size > 0) projByWeekByRoster.set(wk, byRoster);
    }
  } catch {
    // Projections are a nice-to-have. Losing them costs accuracy, not
    // correctness, and `StrengthBasis` will report a zero projection weight.
  }

  /**
   * Projections run hot, and this removes that.
   *
   * A best-lineup total assumes a manager starts the right ten players every
   * week, which nobody does, so the raw number sits well above real scoring:
   * measured at +8.3 points a week across the 2025 season. Feeding that in
   * uncorrected biased every team's expected score upward, and the bias would
   * have grown when the projection weight was raised. Shifting the whole league
   * onto its own historical scoring level removes the inflation while keeping
   * the differences between teams, which is the part that carries signal.
   */
  const projLevelShift = (() => {
    const avgs = current.rosters
      .map((r: any) => projectionsFor(r.roster_id).avg)
      .filter((v: number | null): v is number => v !== null);
    if (avgs.length === 0) return 0;
    const projMean = avgs.reduce((a: number, b: number) => a + b, 0) / avgs.length;
    return projMean - baseline.mean;
  })();

  /** A roster's projected weeks, and their average, used as the level prior. */
  function projectionsFor(rosterId: number) {
    const vals: { week: number; pts: number }[] = [];
    for (const [wk, byRoster] of projByWeekByRoster) {
      const v = byRoster.get(rosterId);
      if (typeof v === 'number') vals.push({ week: wk, pts: v });
    }
    const avg = vals.length
      ? vals.reduce((s, v) => s + v.pts, 0) / vals.length
      : null;
    return { vals, avg };
  }

  // ── Records so far ─────────────────────────────────────────────────────────
  // Straight from Sleeper's roster settings, which already fold in the median
  // game result. Recomputing from head-to-head alone would silently disagree
  // with the standings page for this league.
  const teams: SimTeam[] = current.rosters
    .slice()
    .sort((a, b) => a.roster_id - b.roster_id)
    .map(r => {
      const u = userById.get(r.owner_id);
      const cur   = currentScoresByUser.get(r.owner_id) ?? [];
      const prior = priorScoresByUser.get(r.owner_id) ?? [];
      const { vals: projWeeks, avg: projAvgRaw } = projectionsFor(r.roster_id);
      // Centred on the league's real scoring level, not on the optimistic
      // best-lineup level the projections are stated at.
      const projAvg = projAvgRaw === null ? null : projAvgRaw - projLevelShift;
      const fit = fitTeamStrength({
        currentScores: cur,
        priorScores:   prior,
        projectionPerWeek: projAvg,
        projectedWeeks:    projWeeks.length,
        leagueMean: baseline.mean,
        leagueSd:   baseline.sd,
      });

      // Week-to-week shape from the projections, level from the fit.
      //
      // Deliberately a deviation rather than the projection itself. Sleeper's
      // weekly numbers are largely a season outlook spread across the weeks, so
      // their LEVEL is no better than what history already tells us, but their
      // week-to-week movement encodes something history cannot: who is on a
      // bye. Adding only the deviation keeps the calibrated level and gains the
      // availability signal.
      // The deviation is unaffected by the level shift, since both sides carry
      // it, so this stays a pure week-to-week adjustment.
      const weeklyMean: Record<number, number> = {};
      if (projAvgRaw !== null) {
        for (const { week, pts } of projWeeks) {
          weeklyMean[week] = Math.max(fit.mean * 0.35, fit.mean + (pts - projAvgRaw));
        }
      }
      return {
        rosterId: r.roster_id,
        userId:   r.owner_id ?? '',
        teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        managerName: u?.display_name || 'Unknown',
        avatar:   teamAvatar(u),
        wins:   r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties:   r.settings?.ties ?? 0,
        pointsFor: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
        mean: fit.mean,
        sd:   fit.sd,
        weeklyMean,
        basis: fit.basis,
      };
    });

  // These standings set NEXT season's rookie draft: verified against this
  // league's own history, where the 2026 order was exactly the reverse of the
  // 2025 final standings.
  const draftSeason = String(Number(current.season) + 1);
  const pickOwnership = await firstRoundOwnership(
    current.leagueId, draftSeason, current.rosters.map((r: any) => r.roster_id),
  ).catch(() => Object.fromEntries(current.rosters.map((r: any) => [r.roster_id, r.roster_id])));

  const league: SimLeague = {
    season: current.season,
    weeksPlayed,
    regularSeasonWeeks: current.regularSeasonWeeks,
    playoffTeams: current.playoffTeams,
    playoffRoundType: current.playoffRoundType,
    teams,
    remaining,
    played,
    residuals,
    hasMedianGames: current.hasMedianGames,
    draftSeason,
    pickOwnership,
  };

  return {
    league,
    meta: {
      seasonsOfHistory: seasons.length,
      residualSamples:  residuals.length,
      leagueMean: baseline.mean,
      leagueSd:   baseline.sd,
      /** Weeks for which real Sleeper weekly projections were retrieved. */
      projectedWeeks: projByWeekByRoster.size,
      // With median games on, every team plays twice a week, so the win total
      // a simulated season produces runs to double the number of weeks.
      maxWins: current.regularSeasonWeeks * (current.hasMedianGames ? 2 : 1),
    },
  };
}
