/**
 * Forecasts for every matchup in a week, built once.
 *
 * Shared by the single-matchup drilldown and the home page's week overview. The
 * expensive parts, the week's projections, the NFL game statuses and the league
 * calibration, are fetched once here rather than per matchup: eight teams is
 * four fixtures, and doing this per card would be four times the work for
 * identical data.
 */

import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups } from '@/lib/api';
import { getPlayersDirectory } from '@/lib/playerStats';
import { teamAvatar } from '@/lib/teamAvatar';
import { weeklyProjections, fantasyPositions } from './weeklyProjections';
import { teamGameStatus, hasPlayed, weekPhase, type WeekPhase } from '@/lib/nflSchedule';
import { forecastMatchup, type StarterLine, type MatchupForecast } from './matchupOdds';
import { leagueCalibration } from './leagueCalibration';

export interface ForecastTeam {
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
}

export interface FixtureForecast {
  matchupId: number;
  a: ForecastTeam;
  b: ForecastTeam;
  forecast: MatchupForecast;
  /** Starter detail, only populated when asked for. */
  lines: [StarterLine[], StarterLine[]] | null;
}

export interface WeekForecasts {
  season: string;
  week: number;
  phase: WeekPhase;
  fixtures: FixtureForecast[];
}

export async function weekForecasts(
  leagueId: string,
  season: string,
  week: number,
  /** Starter lines roughly triple the payload, so the overview leaves them out. */
  includeLines = false,
): Promise<WeekForecasts | null> {
  const [info, rosters, users, rows] = await Promise.all([
    getLeagueInfo(leagueId).catch(() => null as any),
    getLeagueRosters(leagueId).catch(() => [] as any[]),
    getLeagueUsers(leagueId).catch(() => [] as any[]),
    getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
  ]);
  if (!rows?.length || !rosters?.length) return null;

  const scoring = info?.scoring_settings ?? null;
  const slots: string[] = info?.roster_positions ?? [];

  const [players, proj, status, phase, calibration] = await Promise.all([
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
    weeklyProjections(season, week, fantasyPositions(slots), scoring),
    teamGameStatus(season, week),
    weekPhase(season, week),
    leagueCalibration(leagueId),
  ]);

  const userById = new Map<string, any>((users ?? []).map((u: any) => [u.user_id, u]));
  const rosterById = new Map<number, any>(rosters.map((r: any) => [r.roster_id, r]));

  const teamOf = (rosterId: number): ForecastTeam => {
    const r = rosterById.get(rosterId);
    const u = r ? userById.get(r.owner_id) : null;
    return {
      rosterId,
      userId: r?.owner_id ?? '',
      teamName: u?.metadata?.team_name || u?.display_name || `Team ${rosterId}`,
      avatar: teamAvatar(u),
    };
  };

  const lineFor = (m: any): StarterLine[] => {
    const pts: Record<string, number> = m.players_points ?? {};
    return (m.starters ?? [])
      .filter((id: string) => id && id !== '0')
      .map((id: string): StarterLine => {
        const p = players?.[id];
        const nflTeam: string | null = p?.team ?? null;
        const gs = nflTeam ? status.get(nflTeam) : undefined;
        // No game this week means a bye, which is a real reason a lineup is
        // short rather than a data problem.
        const playerPhase = !nflTeam || gs === undefined
          ? 'bye' as const
          : hasPlayed(gs) ? 'played' as const : 'upcoming' as const;
        return {
          playerId: id,
          name: p?.full_name
            || [p?.first_name, p?.last_name].filter(Boolean).join(' ')
            || id,
          position: p?.position ?? '--',
          nflTeam,
          projected: proj.get(id) ?? null,
          actual: playerPhase === 'played' ? Number(pts[id] ?? 0) : null,
          phase: playerPhase,
        };
      });
  };

  // Group into fixtures. A row without a matchup id is not being played.
  const groups = new Map<number, any[]>();
  for (const m of rows) {
    if (m?.matchup_id == null) continue;
    if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
    groups.get(m.matchup_id)!.push(m);
  }

  const fixtures: FixtureForecast[] = [];
  for (const [matchupId, pair] of [...groups.entries()].sort((x, y) => x[0] - y[0])) {
    if (pair.length !== 2) continue;
    const [ma, mb] = pair;
    const la = lineFor(ma), lb = lineFor(mb);
    fixtures.push({
      matchupId,
      a: teamOf(ma.roster_id),
      b: teamOf(mb.roster_id),
      forecast: forecastMatchup(la, lb, calibration),
      lines: includeLines ? [la, lb] : null,
    });
  }

  return { season, week, phase, fixtures };
}
