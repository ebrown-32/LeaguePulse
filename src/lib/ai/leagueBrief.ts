/**
 * Assembles the complete, factual snapshot of a league that every AI
 * personality writes from.
 *
 * This is the guardrail that makes the feature trustworthy: the model is told
 * to use only what's in here, so the brief must be real data pulled from the
 * same verified paths the rest of the app renders from — never invented and
 * never "example" values.
 *
 * Server-only. Cached briefly because a single generation run may ask for it
 * several times.
 */
import {
  getLeagueInfo,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getNFLState,
  getAllLeagueSeasons,
  getAllLinkedLeagueIds,
  generateComprehensiveLeagueHistory,
} from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import {
  getPlayersDirectory,
  getSeasonStats,
  resolveStatsSeason,
} from '@/lib/playerStats';

const BASE = 'https://api.sleeper.app/v1';
const TTL_MS = 5 * 60 * 1000;

export interface BriefTeam {
  teamName: string;
  manager: string;
  record: string;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
  topPlayers: { name: string; position: string; points: number | null }[];
}

export interface BriefMatchup {
  week: number;
  home: { teamName: string; points: number };
  away: { teamName: string; points: number };
  margin: number;
}

export interface BriefMove {
  type: 'trade' | 'waiver' | 'free_agent';
  season: string;
  week: number;
  summary: string;
}

export interface LeagueBrief {
  leagueName: string;
  season: string;
  week: number;
  status: string;
  /** Sleeper's NFL season type: 'pre', 'regular' or 'post'. The league's own
   *  status flips to in_season before any game is played, so this is the only
   *  reliable signal that real games have started. */
  seasonType: string;
  /** League format. Absent from the brief entirely until now, so the writers
   *  guessed six playoff teams in a league that takes four. */
  totalTeams: number;
  playoffTeams: number;
  playoffWeekStart: number;
  /**
   * Median matches: every team plays the league median as well as its
   * opponent, so a week is two games rather than one.
   *
   * Absent from the brief entirely until now, which is why the writers were
   * projecting a 14 game season for a league that plays 28.
   */
  medianMatch: boolean;
  /** Weeks before the playoffs start. */
  regularSeasonWeeks: number;
  statsSeason: string;
  teams: BriefTeam[];
  recentMatchups: BriefMatchup[];
  recentMoves: BriefMove[];
  moveTotals: { trade: number; waiver: number; free_agent: number };
  /** Draft picks each team has acquired and given up in the window shown.
   *  Precomputed because working it out from the trade lines is exactly the
   *  arithmetic the writers get wrong. */
  pickMovement: { teamName: string; acquired: string[]; gaveUp: string[] }[];
  history: {
    seasons: number;
    champions: { season: string; teamName: string }[];
    allTimeHigh: number;
  };
  /** Plain-text rendering handed to the model. */
  text: string;
}

let cache: { brief: LeagueBrief; ts: number } | null = null;

function fmtRecord(s: any): string {
  const w = s?.wins ?? 0, l = s?.losses ?? 0, t = s?.ties ?? 0;
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export async function buildLeagueBrief(force = false): Promise<LeagueBrief> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.brief;

  const leagueId = await getCurrentLeagueId();
  const [league, users, rosters, nflState, seasons] = await Promise.all([
    getLeagueInfo(leagueId),
    getLeagueUsers(leagueId),
    getLeagueRosters(leagueId),
    getNFLState(),
    getAllLeagueSeasons(leagueId).catch(() => [] as string[]),
  ]);

  const statsSeason = await resolveStatsSeason(nflState?.season ?? String(new Date().getFullYear()));
  const [players, stats] = await Promise.all([getPlayersDirectory(), getSeasonStats(statsSeason)]);

  const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

  // ── Teams, ranked, with their most productive players ────────────────────
  const ranked = [...rosters].sort((a: any, b: any) => {
    const w = (b.settings?.wins ?? 0) - (a.settings?.wins ?? 0);
    return w !== 0 ? w : (b.settings?.fpts ?? 0) - (a.settings?.fpts ?? 0);
  });

  const teams: BriefTeam[] = ranked.map((r: any, i: number) => {
    const u = userById.get(r.owner_id);
    const top = (r.players ?? [])
      .map((pid: string) => {
        const p = players[pid] ?? {};
        const pts = typeof stats[pid]?.pts_ppr === 'number' ? stats[pid].pts_ppr : null;
        return {
          name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || pid,
          position: p.position ?? '—',
          points: pts,
        };
      })
      .sort((a: any, b: any) => (b.points ?? -1) - (a.points ?? -1))
      .slice(0, 5);

  const playoffWeekStart = Number(league?.settings?.playoff_week_start ?? 15);

    return {
      teamName: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
      manager: u?.display_name ?? '',
      record: fmtRecord(r.settings),
      pointsFor: Number((r.settings?.fpts ?? 0).toFixed(1)),
      pointsAgainst: Number((r.settings?.fpts_against ?? 0).toFixed(1)),
      rank: i + 1,
      topPlayers: top,
    };
  });

  // ── Most recent completed week's scores ──────────────────────────────────
  const rosterName = new Map<number, string>(
    rosters.map((r: any) => {
      const u = userById.get(r.owner_id);
      return [r.roster_id, u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`];
    }),
  );

  const recentMatchups: BriefMatchup[] = [];
  const currentWeek = nflState?.week ?? 0;
  for (let wk = Math.max(1, currentWeek - 1); wk <= Math.max(1, currentWeek) && recentMatchups.length === 0; wk++) {
    const ms = await getLeagueMatchups(leagueId, wk).catch(() => []);
    const groups = new Map<number, any[]>();
    for (const m of ms) {
      if (!m.matchup_id) continue;
      groups.set(m.matchup_id, [...(groups.get(m.matchup_id) ?? []), m]);
    }
    for (const pair of groups.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (!(a.points > 0 || b.points > 0)) continue;
      recentMatchups.push({
        week: wk,
        home: { teamName: rosterName.get(a.roster_id) ?? '?', points: Number((a.points ?? 0).toFixed(1)) },
        away: { teamName: rosterName.get(b.roster_id) ?? '?', points: Number((b.points ?? 0).toFixed(1)) },
        margin: Number(Math.abs((a.points ?? 0) - (b.points ?? 0)).toFixed(1)),
      });
    }
  }

  // ── Recent transactions (this season) ────────────────────────────────────
  /** Kickoff for this season, as epoch ms. Sleeper publishes it directly. */
  const seasonStart = nflState?.season_start_date
    ? Date.parse(`${nflState.season_start_date}T00:00:00Z`)
    : 0;

  const recentMoves: BriefMove[] = [];
  /** Draft picks in and out per team, accumulated across every trade. */
  const pickLedger = new Map<string, { acquired: string[]; gaveUp: string[] }>();
  try {
    const weeks = Math.max(1, currentWeek);
    const batches = await Promise.all(
      Array.from({ length: Math.min(weeks, 6) }, (_, i) =>
        fetch(`${BASE}/league/${leagueId}/transactions/${weeks - i}`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    );
    for (const tx of batches.flat() as any[]) {
      if (tx.status !== 'complete') continue;
      if (!['trade', 'waiver', 'free_agent'].includes(tx.type)) continue;
      const nameOf = (pid: string) => {
        const p = players[pid] ?? {};
        return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || pid;
      };
      // adds/drops map playerId -> rosterId. Listing them unattributed made a
      // two-team trade read as "added X and dropped X" for both sides, so
      // every move is resolved per roster.
      const forRoster = (map: Record<string, number> | null, rosterId: number) =>
        Object.entries(map ?? {}).filter(([, rid]) => rid === rosterId).map(([pid]) => nameOf(pid));

      const rosterIds: number[] = tx.roster_ids ?? [];
      let summary: string;

      if (tx.type === 'trade') {
        // Draft picks were being dropped entirely, which in a dynasty league
        // is most of the value: every trade here involves them, and without
        // them a pick-heavy deal reads as a lopsided giveaway. A pick's worth
        // depends on whose it originally is, so name that owner too.
        const picksFor = (rid: number) =>
          (tx.draft_picks ?? [])
            .filter((d: any) => d.owner_id === rid)
            .map((d: any) => {
              const from = rosterName.get(d.roster_id);
              const own = d.roster_id === rid;
              return `${d.season} round ${d.round} pick${own ? ' (their own)' : from ? ` (originally ${from})` : ''}`;
            });

        // Picks leaving a roster, mirroring picksFor.
        const picksAwayFrom = (rid: number) =>
          (tx.draft_picks ?? [])
            .filter((d: any) => d.previous_owner_id === rid)
            .map((d: any) => {
              const from = rosterName.get(d.roster_id);
              const own = d.roster_id === rid;
              return `${d.season} round ${d.round} pick${own ? ' (their own)' : from ? ` (originally ${from})` : ''}`;
            });

        // BOTH directions, for EVERY participant.
        //
        // Previously only the "receives" side was written and any roster that
        // received nothing was filtered out entirely, which left trades with no
        // named counterparty. The writers then guessed who gave what and got it
        // wrong, once crediting a team with trading away a player it never
        // owned. Stating gives explicitly removes the inference.
        const legs = rosterIds.map(rid => {
          const team = rosterName.get(rid) ?? `Roster ${rid}`;
          const got = [...forRoster(tx.adds, rid), ...picksFor(rid)];
          const gave = [...forRoster(tx.drops, rid), ...picksAwayFrom(rid)];

          // Running total per team, so nobody has to add up pick movement by
          // reading every trade line. A writer did exactly that and got it
          // backwards, reporting a team that had accumulated eight picks as
          // having "moved out a 2028 first and a 2027 first".
          const ledger = pickLedger.get(team) ?? { acquired: [], gaveUp: [] };
          for (const d of (tx.draft_picks ?? []) as any[]) {
            const label = `${d.season} round ${d.round}`;
            if (d.owner_id === rid) ledger.acquired.push(label);
            if (d.previous_owner_id === rid) ledger.gaveUp.push(label);
          }
          pickLedger.set(team, ledger);

          const parts = [
            got.length ? `gets ${got.join(', ')}` : 'gets nothing',
            gave.length ? `gives up ${gave.join(', ')}` : 'gives up nothing',
          ];
          return `${team} ${parts.join(' and ')}`;
        });
        if (!legs.length) continue;
        summary = legs.join(' | ');
      } else {
        const rid = rosterIds[0];
        const team = rosterName.get(rid) ?? `Roster ${rid}`;
        const added = forRoster(tx.adds, rid), dropped = forRoster(tx.drops, rid);
        const parts = [
          added.length ? `added ${added.join(', ')}` : '',
          dropped.length ? `dropped ${dropped.join(', ')}` : '',
        ].filter(Boolean);
        if (!parts.length) continue;
        summary = `${team} ${parts.join(' and ')}`;
      }

      recentMoves.push({
        type: tx.type,
        season: league?.season ?? '',
        /**
         * Offseason or a real week, decided by when the move happened.
         *
         * Sleeper stamps every offseason and preseason transaction with
         * leg = 1, so leg alone cannot tell them apart from week one. This
         * used to read the league's current status instead, which worked only
         * until the season started: the moment Sleeper flipped to regular
         * week 1, every trade made back in August began reporting as week one
         * activity and the writers described a summer of dealing as a frantic
         * opening week.
         *
         * `season_start_date` is the actual kickoff, so anything created
         * before it is the offseason however Sleeper legs it.
         */
        week: seasonStart && tx.created && tx.created < seasonStart
          ? 0
          : (tx.leg ?? 0),
        summary,
      });
    }
  } catch { /* transactions are supplementary — a failure must not sink the brief */ }

  // ── History ──────────────────────────────────────────────────────────────
  let history: LeagueBrief['history'] = { seasons: seasons.length, champions: [], allTimeHigh: 0 };
  try {
    const linked = await getAllLinkedLeagueIds(leagueId);
    const comp = await generateComprehensiveLeagueHistory(linked);
    history = {
      seasons: comp.allTimeStats.totalSeasons,
      champions: comp.records
        .filter((r: any) => r.type === 'championship')
        .sort((a: any, b: any) => Number(b.season) - Number(a.season))
        .slice(0, 6)
        .map((r: any) => ({ season: r.season, teamName: r.username })),
      allTimeHigh: Number((comp.allTimeStats.highestScore ?? 0).toFixed(1)),
    };
  } catch { /* history is expensive and optional */ }

  // One source for the playoff cut, so the week it starts and the regular
  // season length derived from it can never disagree.
  const playoffWeekStart = Number(league?.settings?.playoff_week_start ?? 15);

  const brief: LeagueBrief = {
    leagueName: league?.name ?? 'League',
    season: league?.season ?? '',
    week: currentWeek,
    status: league?.status ?? 'unknown',
    seasonType: nflState?.season_type ?? '',
    totalTeams: Number(league?.total_rosters ?? 0),
    playoffTeams: Number(league?.settings?.playoff_teams ?? 0),
    playoffWeekStart: playoffWeekStart,
    medianMatch: Number(league?.settings?.league_average_match ?? 0) === 1,
    regularSeasonWeeks: Math.max(0, playoffWeekStart - 1),
    statsSeason,
    teams,
    recentMatchups: recentMatchups.slice(0, 8),
    // Trades first, then everything else. A flat slice was dropping every
    // trade: free agent churn outnumbers trades roughly five to one, so the
    // cap filled with waiver noise and the assistant reported "no trades this
    // offseason" while sixteen sat in the same week.
    recentMoves: [
      ...recentMoves.filter(m => m.type === 'trade').slice(0, 16),
      ...recentMoves.filter(m => m.type !== 'trade').slice(0, 10),
    ],
    /** Totals across the whole window, not just the moves listed. */
    pickMovement: [...pickLedger.entries()]
      .map(([teamName, v]) => ({ teamName, ...v }))
      .filter(p => p.acquired.length || p.gaveUp.length)
      .sort((a, b) => (b.acquired.length + b.gaveUp.length) - (a.acquired.length + a.gaveUp.length)),
    moveTotals: {
      trade: recentMoves.filter(m => m.type === 'trade').length,
      waiver: recentMoves.filter(m => m.type === 'waiver').length,
      free_agent: recentMoves.filter(m => m.type === 'free_agent').length,
    },
    history,
    text: '',
  };
  brief.text = renderBrief(brief);

  cache = { brief, ts: Date.now() };
  return brief;
}

/** Plain-English statement of where the league sits in its calendar. Without
 *  this the personas guessed, and described offseason trades as week 1 games. */
function phaseDescription(b: LeagueBrief): string {
  // Sleeper marks a league 'in_season' as soon as it is set up for the year,
  // which is well before kickoff, and reports a week number that during the
  // preseason counts PRESEASON weeks. Reading those two together produced
  // "regular season, week 2" in August with nothing played. The NFL season
  // type is the authority on whether games have actually started.
  if (b.seasonType === 'pre') {
    return `PRESEASON for ${b.season}. NO regular season games have been played and there ` +
      `are no results. Sleeper reports a preseason week counter; it is NOT a season week, so ` +
      `never say "week N of the season" or imply the season is underway. Every record below ` +
      `is 0-0 because nothing has counted yet. Player figures are from the ${b.statsSeason} ` +
      `season, which is finished.`;
  }

  switch (b.status) {
    case 'pre_draft':
      return `OFFSEASON. The ${b.season} draft has NOT happened yet and the season has not started. ` +
        `No games have been played and there are no scores. Every transaction listed below is an ` +
        `OFFSEASON move, not a move during a game week. Never refer to a week number, or to any ` +
        `${b.season} game, matchup, or result. Player figures shown are from the ${b.statsSeason} ` +
        `season, which is finished.`;
    case 'drafting':
      return `DRAFT IN PROGRESS for ${b.season}. No games have been played yet. Do not refer to game weeks or results.`;
    case 'in_season':
      return `REGULAR SEASON, currently week ${b.week} of ${b.season}.`;
    case 'post_season':
      return `PLAYOFFS, week ${b.week} of ${b.season}.`;
    case 'complete':
      return `The ${b.season} season is COMPLETE. Everything below is final.`;
    default:
      return `Status: ${b.status}, week ${b.week} of ${b.season}.`;
  }
}

/** Compact plain text, cheaper and less ambiguous for the model than JSON. */
export function renderBrief(b: LeagueBrief): string {
  const lines: string[] = [];
  lines.push(`LEAGUE: ${b.leagueName}, ${b.season} season.`);
  // Writers kept treating a manager and their team as two different people,
  // producing lines like "AshKashh69 made 15 moves and Just Jaxson Off made 15
  // moves" about a single roster.
  lines.push(
    '',
    'MANAGERS AND TEAMS ARE THE SAME THING:',
    '  Every team above is run by exactly one manager. The team name and the',
    '  manager handle are two names for one entity, never two participants.',
    '  Never write a sentence that has both doing something separately.',
  );

  if (b.totalTeams) {
    const fmt = [`${b.totalTeams} teams`];
    if (b.playoffTeams) fmt.push(`${b.playoffTeams} make the playoffs`);
    if (b.playoffWeekStart) fmt.push(`playoffs begin in week ${b.playoffWeekStart}`);
    lines.push('', 'LEAGUE FORMAT:', `  ${fmt.join(', ')}.`,
      `  EXACTLY ${b.playoffTeams} teams make the playoffs. Never name more or fewer.`);

    if (b.medianMatch && b.regularSeasonWeeks) {
      const games = b.regularSeasonWeeks * 2;
      lines.push(
        `  THIS LEAGUE PLAYS MEDIAN MATCHES. Every week is TWO games: one against`,
        `  your scheduled opponent, and one against the league median score. A`,
        `  ${b.regularSeasonWeeks} week regular season is therefore ${games} games, not ${b.regularSeasonWeeks}.`,
        `  Every won-lost record you write must add up to ${games}. A record like`,
        `  ${Math.round(games * 0.64)}-${games - Math.round(games * 0.64)} is right; ${Math.round(b.regularSeasonWeeks * 0.64)}-${b.regularSeasonWeeks - Math.round(b.regularSeasonWeeks * 0.64)} is half a season and wrong.`,
        `  Every game has one winner and one loser, so across all ${b.totalTeams} teams the`,
        `  wins and the losses must come to the same number: ${(b.totalTeams * games) / 2} each.`,
        `  Get as close to that as you can: a table where the league wins far`,
        `  more games than it loses does not describe a real season.`,
      );
    } else if (b.regularSeasonWeeks) {
      lines.push(
        `  One game per week, so a full regular season record adds up to ${b.regularSeasonWeeks}.`,
      );
    }
  }

  lines.push('', 'PHASE:', `  ${phaseDescription(b)}`);
  lines.push(`Player production figures below are from the ${b.statsSeason} season (PPR).`);

  lines.push('', 'STANDINGS:');
  for (const t of b.teams) {
    lines.push(
      `  ${t.rank}. ${t.teamName} (${t.manager}) — ${t.record}, ${t.pointsFor} PF / ${t.pointsAgainst} PA`,
    );
    const top = t.topPlayers.filter(p => p.points != null).slice(0, 3);
    if (top.length) {
      lines.push(`     top: ${top.map(p => `${p.name} (${p.position}, ${p.points})`).join('; ')}`);
    }
  }

  if (b.recentMatchups.length) {
    lines.push('', 'MOST RECENT SCORES:');
    for (const m of b.recentMatchups) {
      lines.push(`  Wk ${m.week}: ${m.home.teamName} ${m.home.points} — ${m.away.points} ${m.away.teamName} (margin ${m.margin})`);
    }
  } else {
    lines.push('', 'MOST RECENT SCORES: none — no games have been played yet.');
  }

  if (b.recentMoves.length) {
    const t = b.moveTotals;
    lines.push(
      '',
      `TRANSACTION TOTALS (complete counts for the window): ${t.trade} trades, ` +
      `${t.waiver} waiver claims, ${t.free_agent} free agent moves. Quote these ` +
      'totals; the list below shows every trade but only a sample of the rest.',
    );
    lines.push('', 'RECENT TRANSACTIONS:');
    for (const m of b.recentMoves) {
      lines.push(`  [${m.type}] ${m.week > 0 ? `wk ${m.week}` : 'offseason'}: ${m.summary}`);
    }

    // Counting is the one thing models reliably get wrong, and three separate
    // personas miscounted the same team's moves. Precomputing removes the task
    // entirely: they quote a number instead of tallying lines.
    const tally = new Map<string, number>();
    for (const m of b.recentMoves) {
      for (const t of b.teams) {
        if (m.summary.includes(t.teamName)) tally.set(t.teamName, (tally.get(t.teamName) ?? 0) + 1);
      }
    }
    if (tally.size) {
      lines.push('', 'MOVE COUNTS (exact, in the window shown above; quote these, never tally the lines yourself):');
      for (const [team, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${team}: ${n} ${n === 1 ? 'move' : 'moves'}`);
      }
    }

    // Same reasoning as the move counts. A writer that worked pick movement
    // out from the trade lines described a team holding eight acquired picks
    // as having "moved out a 2028 first and a 2027 first".
    if (b.pickMovement.length) {
      lines.push(
        '',
        'DRAFT PICK MOVEMENT (exact, in the window shown above). Quote these. ' +
        'Never work out from the trade lines who is accumulating or shedding picks:',
      );
      for (const p of b.pickMovement) {
        const got = p.acquired.length ? p.acquired.join(', ') : 'none';
        const lost = p.gaveUp.length ? p.gaveUp.join(', ') : 'none';
        lines.push(
          `  ${p.teamName}: acquired ${p.acquired.length} (${got}); ` +
          `gave up ${p.gaveUp.length} (${lost})`,
        );
      }
    }
  }

  if (b.history.champions.length) {
    const [latest, ...earlier] = b.history.champions;
    lines.push('', 'HISTORY:');
    lines.push(`  ${b.history.seasons} seasons played. All-time high score: ${b.history.allTimeHigh}.`);
    // Spelled out rather than left as a bare list: a comma-separated
    // "2025 X, 2024 Y" invited the model to credit the wrong manager with the
    // most recent title.
    lines.push(`  Reigning champion — won the ${latest.season} season, the most recent completed season: manager ${latest.teamName}.`);
    if (earlier.length) {
      lines.push(`  Earlier champions (NOT the reigning champion): ${earlier.map(c => `${c.season} — manager ${c.teamName}`).join('; ')}.`);
    }
    lines.push('  Do not describe any earlier champion as the current or most recent titleholder.');
    // Counted explicitly. The brief named who won what but never how many
    // each had, and a writer filled the gap by calling a one time winner a
    // back-to-back champion.
    const titleCount = new Map<string, number>();
    for (const c of b.history.champions) {
      titleCount.set(c.teamName, (titleCount.get(c.teamName) ?? 0) + 1);
    }
    const counts = [...titleCount.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([name, n]) => `${name} ${n}`)
      .join(', ');
    lines.push(`  Titles won, by manager: ${counts}.`);
    if ([...titleCount.values()].every(n => n === 1)) {
      lines.push('  Nobody in this league has won more than one title. Never call anyone a');
      lines.push('  repeat, back to back, or multiple time champion.');
    }
  }

  return lines.join('\n');
}
