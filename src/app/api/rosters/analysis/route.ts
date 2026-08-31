import { NextResponse } from 'next/server';
import {
  getLeagueRosters, getLeagueUsers, getNFLState, getAllLeagueSeasons, getLeagueInfo,
  getLeagueMatchups, getAllLinkedLeagueIds,
} from '@/lib/api';
import { getCurrentLeagueId, INITIAL_LEAGUE_ID } from '@/config/league';
import {
  getPlayersDirectory, getSeasonStats, getSeasonProjections, resolveStatsSeason,
} from '@/lib/playerStats';
import { teamAvatar } from '@/lib/teamAvatar';

export const dynamic = 'force-dynamic';

/**
 * Every rostered player in the league, flat, each tagged with its owner.
 *
 * Flat rather than pre-grouped by team: the page picks one team at a time, but
 * the dynasty breakdown underneath needs the whole league to say whether a
 * roster's value is unusual. Grouping here would mean flattening it again to
 * work that out.
 *
 * Every field comes from Sleeper. Nothing is modelled or inferred: a player
 * with no projection published gets null, not an estimate, and nothing here
 * invents a "value score" on top of the prices Sleeper actually publishes.
 */
export interface AnalysisPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  /** Which league team holds them, and whether they are starting. */
  rosterId: number;
  ownerName: string;
  starter: boolean;

  age: number | null;
  /** Pounds and inches, as Sleeper reports them. */
  weight: number | null;
  height: number | null;
  yearsExp: number | null;
  college: string | null;

  /** Situation: where they sit on their NFL team and whether they are fit. */
  depthChartOrder: number | null;
  depthChartPosition: string | null;
  status: string | null;
  injuryStatus: string | null;

  /** Past production, from the selected season. */
  points: number | null;
  gamesPlayed: number | null;
  pointsPerGame: number | null;

  /** Sleeper's published full-season forecast for the projection season. */
  projectedPoints: number | null;
  /** Average draft position, PPR redraft. A rough market price. */
  adp: number | null;
  /**
   * Dynasty startup ADP, PPR. Lower is more valuable.
   *
   * The one real measure of dynasty worth available here: a market price that
   * already folds in age, situation and remaining career, which is exactly
   * what separates dynasty value from this year's projection. Sleeper reports
   * 999 for players it has no dynasty price for; that is stored as null rather
   * than as a very low value.
   */
  dynastyAdp: number | null;
}

export interface AnalysisResponse {
  /** The season whose roster is on screen. Distinct from `statsSeason`: the
   *  live roster is shown with last season's scoring laid over it, so the two
   *  differ in the preseason and the picker must follow this one. */
  rosterSeason: string;
  statsSeason: string;
  projectionSeason: string;
  seasons: string[];
  /** Weeks that have a frozen roster on record for this season. */
  weeks: number[];
  /** The week being shown, or null for the season's final roster. */
  week: number | null;
  /**
   * Whether this is the roster as it stands now.
   *
   * A past season or a specific week is a snapshot of what was, so the
   * forward-looking half of the page has nothing to say about it: there is no
   * projecting a season already played, and dynasty worth is a statement about
   * a roster someone still owns.
   */
  isCurrent: boolean;
  /** The season being shown is the one being played. Distinct from
   *  `isCurrent`, which is also false once a specific week is picked. */
  isCurrentSeason: boolean;
  /** Sleeper's league type: 0 redraft, 1 keeper, 2 dynasty. Read rather than
   *  assumed, so the dynasty breakdown only appears where it means something. */
  leagueType: number;
  isDynasty: boolean;
  teams: {
    rosterId: number; name: string; manager: string; avatar: string;
    record: { wins: number; losses: number; ties: number };
  }[];
  players: AnalysisPlayer[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Sleeper fills unpriced players with 999. That is "no market", not a slot. */
const priced = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n < 999 ? n : null;
};

export async function GET(request: Request) {
  if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
    return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  }

  const params = new URL(request.url).searchParams;
  const requested = params.get('season');
  const requestedWeek = Number(params.get('week')) || null;

  try {
    const currentLeagueId = await getCurrentLeagueId();
    const [nflState, seasons, league] = await Promise.all([
      getNFLState(), getAllLeagueSeasons(currentLeagueId), getLeagueInfo(currentLeagueId),
    ]);
    const leagueType = Number(league?.settings?.type ?? 0);

    const currentSeason = nflState?.season ?? String(new Date().getFullYear());

    /**
     * Which roster to show, and which season's scoring to lay over it. They
     * are not the same question.
     *
     * Asked for nothing, the page shows the roster as it stands today with
     * last season's production against it, because in the preseason the
     * current year has no scores yet. Asked for a season explicitly, it
     * travels back and shows that season's roster and that season's scoring.
     * Collapsing the two made the default view look like a 2025 snapshot and
     * silently dropped its projections.
     */
    const picked = requested && seasons.includes(requested) ? requested : null;
    const rosterSeason = picked ?? currentSeason;
    const statsSeason = picked ?? await resolveStatsSeason(currentSeason);

    /**
     * Each season is its own league on Sleeper, so a past season's roster
     * lives behind a different id. The page used to always read the current
     * league and merely lay a different year's scoring over today's players,
     * which showed managers holding people they had not yet traded for.
     */
    const linked = await getAllLinkedLeagueIds(currentLeagueId);
    let seasonLeagueId = currentLeagueId;
    for (const id of linked) {
      const info = await getLeagueInfo(id).catch(() => null);
      if (info?.season === rosterSeason) { seasonLeagueId = id; break; }
    }

    const week = requestedWeek && requestedWeek > 0 ? requestedWeek : null;
    const isCurrent = rosterSeason === currentSeason && week === null;

    // Projections describe a season still to be played, so they only belong on
    // the live roster. Attaching them to a 2024 snapshot would be forecasting
    // a result already in the record.
    const projectionSeason = currentSeason;

    const [rosters, users, players, stats, projections] = await Promise.all([
      getLeagueRosters(seasonLeagueId),
      getLeagueUsers(seasonLeagueId),
      getPlayersDirectory(),
      getSeasonStats(statsSeason),
      isCurrent ? getSeasonProjections(projectionSeason) : Promise.resolve({} as Record<string, any>),
    ]);

    /**
     * A specific week's roster, frozen as it was played.
     *
     * Sleeper's matchup rows carry that week's `players` and `starters` plus
     * `players_points`, which is a genuine snapshot rather than today's roster
     * with old scores attached. When a week is asked for, it replaces both the
     * squad list and the production shown against it.
     */
    let weekRosters: Map<number, { players: string[]; starters: string[]; points: Record<string, number> }> | null = null;
    if (week) {
      const matchups = await getLeagueMatchups(seasonLeagueId, week).catch(() => []);
      if (matchups.length) {
        weekRosters = new Map();
        for (const m of matchups as any[]) {
          weekRosters.set(m.roster_id, {
            players: (m.players ?? []).filter(Boolean),
            starters: (m.starters ?? []).filter((id: string) => id && id !== '0'),
            points: m.players_points ?? {},
          });
        }
      }
    }

    /** Weeks with a frozen roster on record, so the picker offers real ones. */
    const playoffStart = Number(league?.settings?.playoff_week_start ?? 15);
    // Only weeks that have actually kicked off have a frozen roster. The week
    // in progress counts: its lineups are locked and its points are live.
    const lastWeek = rosterSeason === currentSeason
      ? (nflState?.season_type === 'pre' ? 0 : Number(nflState?.week ?? 0))
      : playoffStart + 2;
    const weeks = Array.from({ length: Math.max(0, Math.min(lastWeek, 18)) }, (_, i) => i + 1);

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
    const teams = rosters.map((r: any) => {
      const u = userById.get(r.owner_id);
      return {
        rosterId: r.roster_id,
        name: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
        manager: u?.display_name ?? '',
        avatar: teamAvatar(u),
        record: {
          wins: r.settings?.wins ?? 0,
          losses: r.settings?.losses ?? 0,
          ties: r.settings?.ties ?? 0,
        },
      };
    });
    const nameByRoster = new Map<number, string>(teams.map((t: any) => [t.rosterId, t.name]));

    const out: AnalysisPlayer[] = [];
    for (const r of rosters as any[]) {
      const frozen = weekRosters?.get(r.roster_id);
      // The week's squad when one was asked for, otherwise the season's final.
      const squadIds: string[] = frozen ? frozen.players : ((r.players ?? []) as string[]);
      const starters = new Set<string>(
        frozen ? frozen.starters : (r.starters ?? []).filter((id: string) => id && id !== '0'),
      );

      for (const id of squadIds) {
        if (!id) continue;
        const p = players[id];
        // A player the directory has never heard of cannot be analysed on any
        // of these axes, so they are left out rather than shown as all dashes.
        if (!p) continue;
        const st = stats[id] ?? {};
        const pr = projections[id] ?? {};
        // A week view shows that week's actual points, not the season total.
        const points = frozen ? num(frozen.points[id]) : num(st.pts_ppr);
        const gp = frozen ? null : num(st.gp);

        out.push({
          playerId: id,
          name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || `Player ${id}`,
          position: p.position ?? '—',
          nflTeam: p.team ?? 'FA',
          rosterId: r.roster_id,
          ownerName: nameByRoster.get(r.roster_id) ?? `Roster ${r.roster_id}`,
          starter: starters.has(id),

          age: num(p.age),
          weight: num(p.weight) ?? (p.weight ? Number(p.weight) || null : null),
          height: num(p.height) ?? (p.height ? Number(p.height) || null : null),
          yearsExp: num(p.years_exp),
          college: p.college || null,

          depthChartOrder: num(p.depth_chart_order),
          depthChartPosition: p.depth_chart_position || null,
          status: p.status || null,
          injuryStatus: p.injury_status || null,

          points,
          gamesPlayed: gp,
          pointsPerGame: points != null && gp ? Number((points / gp).toFixed(1)) : null,

          projectedPoints: num(pr.pts_ppr),
          adp: priced(pr.adp_ppr),
          dynastyAdp: priced(pr.adp_dynasty_ppr),
        });
      }
    }

    return NextResponse.json({
      rosterSeason,
      statsSeason,
      projectionSeason,
      seasons: [...seasons].sort((a, b) => Number(b) - Number(a)),
      weeks,
      week,
      isCurrent,
      isCurrentSeason: rosterSeason === currentSeason,
      leagueType,
      isDynasty: leagueType === 2,
      teams,
      players: out,
    } satisfies AnalysisResponse);
  } catch (err) {
    console.error('[api/rosters/analysis]', err);
    return NextResponse.json({ error: 'Failed to load roster analysis' }, { status: 500 });
  }
}
