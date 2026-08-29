import { getLeagueInfo, getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getAllLinkedLeagueIds } from '@/lib/api';

/**
 * League standings.
 *
 * Built from the week by week matchup record rather than from Sleeper's
 * roster settings, because the settings carry a running total and nothing
 * else: no streak, no form, no record against the weekly median, and no way to
 * see a team that is 6-2 on a schedule that never tested it.
 *
 * Seeding follows the league's own tiebreak, which on Sleeper is record first
 * and total points second.
 */

export interface StandingsRow {
  rank: number;
  rosterId: number;
  userId: string;
  teamName: string;
  manager: string;
  avatar: string;

  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Points for minus against; the number that says whether a record is real. */
  differential: number;

  /** Most recent results, newest first, for a form guide. */
  form: ('W' | 'L' | 'T')[];
  /** Current run, e.g. 3 for a three game win streak, -2 for two losses. */
  streak: number;

  /** Record against every other team each week. */
  allPlayWins: number;
  allPlayLosses: number;
  allPlayPct: number;

  /** Inside the playoff field on current seeding. */
  inPlayoffs: boolean;
  /** Games behind the last playoff place; 0 when already in. */
  gamesBack: number;
}

export interface Standings {
  /** True when records include a weekly game against the league median. */
  medianMatch: boolean;
  season: string;
  throughWeek: number;
  leagueName: string;
  playoffTeams: number;
  rows: StandingsRow[];
}

function round(n: number, dp = 2): number {
  return Number(n.toFixed(dp));
}

/** With an even number of teams this is the mean of the middle two, which is
 *  the value Sleeper scores the median match against. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function buildStandings(): Promise<Standings | null> {
  return buildStandingsFor(await getCurrentLeagueId());
}

/**
 * Standings for one league, optionally through a given week.
 *
 * The week override exists so the table can be exercised against a season that
 * has actually been played. Out of season the live path correctly returns
 * null, which would otherwise leave every calculation here unverified until
 * September.
 */
export async function buildStandingsFor(
  leagueId: string,
  weekOverride?: number,
): Promise<Standings | null> {
  const [league, rosters, users, nflState] = await Promise.all([
    getLeagueInfo(leagueId),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getNFLState(),
  ]);

  const seasonType = String(nflState?.season_type ?? '');
  const playoffStart = Number((league as any)?.settings?.playoff_week_start ?? 15);
  /**
   * Median matches: every team also plays the league median each week, so a
   * season is two games a week rather than one.
   *
   * The field is `league_average_match`. Sleeper does not expose a
   * `median_wins` setting, which is what the older code in lib/api.ts checks,
   * so that check has always been false and the feature silently ignored.
   */
  const medianMatch = Number((league as any)?.settings?.league_average_match ?? 0) === 1;
  const fullSeason = Math.max(0, playoffStart - 1);

  // A past season is finished, so it runs to the end of its own regular
  // season. Only the live one is bounded by where the NFL currently is.
  //
  // Reading the current week for every season was a real bug: during the
  // preseason it made every historical table, and the all-time table built
  // from them, come back empty.
  const isCurrentSeason = String((league as any)?.season ?? '') === String(nflState?.season ?? '');
  const lastWeek = weekOverride ?? (
    !isCurrentSeason ? fullSeason
      // Preseason weeks are not fantasy weeks, so there is nothing to stand on.
      : seasonType === 'pre' ? 0
        : Math.min(Number(nflState?.week ?? 0), fullSeason)
  );
  if (lastWeek < 1) return null;

  const userById = new Map(users.map(u => [u.user_id, u]));
  const meta = new Map<number, { userId: string; teamName: string; manager: string; avatar: string }>();
  for (const r of rosters as any[]) {
    const u: any = userById.get(r.owner_id);
    meta.set(Number(r.roster_id), {
      userId: String(r.owner_id ?? ''),
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      manager: u?.display_name || 'Unknown',
      avatar: u?.avatar || '',
    });
  }

  const weekly = await Promise.all(
    Array.from({ length: lastWeek }, (_, i) =>
      getLeagueMatchups(leagueId, i + 1).catch(() => [] as any[])),
  );

  const rows = new Map<number, StandingsRow>();
  for (const [rosterId, m] of meta) {
    rows.set(rosterId, {
      rank: 0, rosterId, userId: m.userId, teamName: m.teamName, manager: m.manager, avatar: m.avatar,
      wins: 0, losses: 0, ties: 0, winPct: 0,
      pointsFor: 0, pointsAgainst: 0, differential: 0,
      form: [], streak: 0,
      allPlayWins: 0, allPlayLosses: 0, allPlayPct: 0,
      inPlayoffs: false, gamesBack: 0,
    });
  }

  let played = 0;
  for (const raw of weekly) {
    if (!Array.isArray(raw) || !raw.length) continue;
    // A scheduled but unplayed week is all zeroes and would invent losses.
    if (!raw.some(m => Number(m.points ?? 0) > 0)) continue;
    played++;

    const scores = raw.map(m => Number(m.points ?? 0));
    const med = median(scores);
    const byMatchup = new Map<number, any[]>();
    for (const m of raw) {
      const id = Number(m.matchup_id);
      if (!Number.isFinite(id)) continue;
      if (!byMatchup.has(id)) byMatchup.set(id, []);
      byMatchup.get(id)!.push(m);
    }

    for (const m of raw) {
      const row = rows.get(Number(m.roster_id));
      if (!row) continue;
      const mine = Number(m.points ?? 0);
      const opp = (byMatchup.get(Number(m.matchup_id)) ?? [])
        .find(x => Number(x.roster_id) !== Number(m.roster_id));

      row.pointsFor = round(row.pointsFor + mine);
      row.allPlayWins += scores.filter(s => mine > s).length;
      row.allPlayLosses += scores.filter(s => mine < s).length;

      // The median game, when the league plays them. Recorded first so the
      // form guide reads head-to-head as the more recent of the two.
      if (medianMatch) {
        if (mine > med) row.wins++;
        else if (mine < med) row.losses++;
        else row.ties++;
      }

      if (!opp) continue;
      const theirs = Number(opp.points ?? 0);
      row.pointsAgainst = round(row.pointsAgainst + theirs);
      if (mine > theirs) { row.wins++; row.form.unshift('W'); }
      else if (mine < theirs) { row.losses++; row.form.unshift('L'); }
      else { row.ties++; row.form.unshift('T'); }
    }
  }
  if (!played) return null;

  for (const row of rows.values()) {
    const games = row.wins + row.losses + row.ties;
    row.winPct = games ? round((row.wins + row.ties * 0.5) / games, 3) : 0;
    row.differential = round(row.pointsFor - row.pointsAgainst);
    const ap = row.allPlayWins + row.allPlayLosses;
    row.allPlayPct = ap ? round((row.allPlayWins / ap) * 100, 1) : 0;

    // Streak runs from the most recent result backwards, and stops at the
    // first different one. Ties end a streak rather than extending it.
    const [first] = row.form;
    if (first === 'W' || first === 'L') {
      let n = 0;
      for (const r of row.form) { if (r !== first) break; n++; }
      row.streak = first === 'W' ? n : -n;
    }
    row.form = row.form.slice(0, 5);
  }

  // Sleeper's default tiebreak: record, then total points.
  const ordered = [...rows.values()].sort((a, b) =>
    (b.winPct - a.winPct) || (b.pointsFor - a.pointsFor));
  ordered.forEach((r, i) => { r.rank = i + 1; });

  const playoffTeams = Number((league as any)?.settings?.playoff_teams ?? 0);
  const cutoff = ordered[playoffTeams - 1];
  for (const r of ordered) {
    r.inPlayoffs = playoffTeams > 0 && r.rank <= playoffTeams;
    // Games back is measured against the last team currently holding a place,
    // which is what "in the hunt" actually means.
    r.gamesBack = !cutoff || r.inPlayoffs ? 0
      : round(((cutoff.wins - r.wins) + (r.losses - cutoff.losses)) / 2, 1);
  }

  return {
    medianMatch,
    season: String((league as any)?.season ?? nflState?.season ?? ''),
    throughWeek: played,
    leagueName: String((league as any)?.name ?? 'League'),
    playoffTeams,
    rows: ordered,
  };
}


/**
 * Every season the league has played, newest first.
 *
 * Sleeper chains a separate league id per season, so choosing a past season
 * means choosing a different league entirely.
 */
export async function standingsSeasons(): Promise<{ season: string; leagueId: string }[]> {
  const ids = await getAllLinkedLeagueIds(await getCurrentLeagueId());
  const rows = await Promise.all(ids.map(async id => {
    const l: any = await getLeagueInfo(id).catch(() => null);
    return l?.season ? { season: String(l.season), leagueId: id } : null;
  }));
  return rows.filter((r): r is { season: string; leagueId: string } => r !== null)
    .sort((a, b) => b.season.localeCompare(a.season));
}

/**
 * The all-time table.
 *
 * Rows are keyed by Sleeper user id rather than roster id, because roster ids
 * are reassigned between seasons and a manager who changed slots would
 * otherwise be split into two entries, or worse, merged with someone else.
 *
 * The playoff cut is deliberately absent here: qualifying is a thing that
 * happens within one season, and drawing a line across a career table would
 * be stating something that does not exist.
 */
export async function buildAllTimeStandings(): Promise<Standings | null> {
  const seasons = await standingsSeasons();
  if (!seasons.length) return null;

  const tables = await Promise.all(
    seasons.map(s => buildStandingsFor(s.leagueId).catch(() => null)),
  );
  const played = tables.filter((t): t is Standings => t !== null);
  if (!played.length) return null;

  const byUser = new Map<string, StandingsRow>();
  // Oldest first, so the form guide ends up in chronological order and the
  // streak reads from the most recent season backwards.
  for (const table of [...played].reverse()) {
    for (const r of table.rows) {
      if (!r.userId) continue;
      const cur = byUser.get(r.userId);
      if (!cur) {
        byUser.set(r.userId, { ...r, rank: 0, inPlayoffs: false, gamesBack: 0, form: [...r.form] });
        continue;
      }
      cur.wins += r.wins; cur.losses += r.losses; cur.ties += r.ties;
      cur.pointsFor = round(cur.pointsFor + r.pointsFor);
      cur.pointsAgainst = round(cur.pointsAgainst + r.pointsAgainst);
      cur.allPlayWins += r.allPlayWins;
      cur.allPlayLosses += r.allPlayLosses;
      // Newer results lead, and the guide stays five long.
      cur.form = [...r.form, ...cur.form].slice(0, 5);
      // Whatever they go by now.
      cur.teamName = r.teamName; cur.manager = r.manager; cur.avatar = r.avatar;
    }
  }

  const rows = [...byUser.values()];
  for (const r of rows) {
    const games = r.wins + r.losses + r.ties;
    r.winPct = games ? round((r.wins + r.ties * 0.5) / games, 3) : 0;
    r.differential = round(r.pointsFor - r.pointsAgainst);
    const ap = r.allPlayWins + r.allPlayLosses;
    r.allPlayPct = ap ? round((r.allPlayWins / ap) * 100, 1) : 0;
    const [first] = r.form;
    r.streak = 0;
    if (first === 'W' || first === 'L') {
      let n = 0;
      for (const x of r.form) { if (x !== first) break; n++; }
      r.streak = first === 'W' ? n : -n;
    }
  }

  rows.sort((a, b) => (b.winPct - a.winPct) || (b.pointsFor - a.pointsFor));
  rows.forEach((r, i) => { r.rank = i + 1; });

  return {
    // Whatever the seasons used; they all came through the same builder.
    medianMatch: played.some(t => t.medianMatch),
    season: 'all-time',
    throughWeek: played.reduce((n, t) => n + t.throughWeek, 0),
    leagueName: played[0].leagueName,
    // No cut line on a career table.
    playoffTeams: 0,
    rows,
  };
}
