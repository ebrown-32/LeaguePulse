/**
 * Builds the analytics tables from Sleeper, across every linked season.
 *
 * All five come out of one pass so the expensive reads are shared: a season's
 * matchups give the matchups table, the player weeks and the bench points;
 * the player weeks give the drafts table its "what did the pick go on to
 * score" column. Built once and memoised for ten minutes per league; a
 * completed season never changes, and the current one moves weekly.
 *
 * ── Final weeks only ─────────────────────────────────────────────────────────
 *
 * The current season contributes only weeks whose NFL games are all final.
 * A self-serve table that quietly mixed a half-played Sunday into a season
 * average would produce numbers that are wrong in a way nobody could see.
 */

import {
  getAllLinkedLeagueIds, getLeagueInfo, getLeagueUsers, getLeagueRosters,
  getLeagueMatchups, getSeasonTransactions, getPlayoffBracket, getNFLState,
} from '@/lib/api';
import { getPlayersDirectory } from '@/lib/playerStats';
import { weekPhase } from '@/lib/nflSchedule';
import { playoffRoundWeeks } from '@/lib/sim/playoffs';
import type { DatasetId } from './schema';

export type Row = Record<string, string | number | boolean | null>;
export type Tables = Record<DatasetId, Row[]> & { builtAt: string; seasonList: string[] };

const TTL_MS = 10 * 60 * 1000;
const memo = new Map<string, { at: number; value: Promise<Tables> }>();

export function analyticsTables(leagueId: string): Promise<Tables> {
  const hit = memo.get(leagueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(leagueId);
  memo.set(leagueId, { at: Date.now(), value });
  // A failed build must not be served for ten minutes.
  value.catch(() => memo.delete(leagueId));
  return value;
}

const r1 = (n: number) => Math.round(n * 100) / 100;
const TYPE_LABEL: Record<string, string> = { trade: 'Trade', waiver: 'Waiver', free_agent: 'Free agent', commissioner: 'Commissioner' };

async function build(rootLeagueId: string): Promise<Tables> {
  const [linked, nflState, players] = await Promise.all([
    getAllLinkedLeagueIds(rootLeagueId),
    getNFLState().catch(() => null as any),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
  ]);
  const currentSeason = String(nflState?.season ?? '');

  // Names from the current league: a manager's team name is whatever they
  // call it now, which is what people will search for.
  const currentUsers = await getLeagueUsers(rootLeagueId).catch(() => [] as any[]);
  const teamNameNow = new Map<string, string>(
    currentUsers.map((u: any) => [u.user_id, u.metadata?.team_name || u.display_name]));
  /**
   * People are their user id, shown under today's name. Display names change:
   * one manager here was "Ashkaash69" in 2024 and "AshKashh69" after, and
   * keying by the name of the season split their history into two people.
   */
  const managerNow = new Map<string, string>(currentUsers.map((u: any) => [u.user_id, u.display_name]));

  const playerName = (id: string) => {
    const p = players[id];
    if (!p) return id;
    if (p.position === 'DEF') return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || id;
    return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || id;
  };

  const out: Tables = {
    matchups: [], seasons: [], players: [], transactions: [], drafts: [],
    builtAt: new Date().toISOString(), seasonList: [],
  };
  const seasonsSeen: string[] = [];
  /** season|playerId -> points scored while rostered, for the drafts table. */
  const seasonPoints = new Map<string, number>();

  for (const leagueId of linked) {
    const info: any = await getLeagueInfo(leagueId).catch(() => null);
    if (!info) continue;
    const season = String(info.season);
    const isCurrent = season === currentSeason;
    const playoffStart = Number(info.settings?.playoff_week_start ?? 15);
    const lastWeek = Math.min(18, Number(info.settings?.last_scored_leg ?? 0) || 17);
    const playoffTeams = Number(info.settings?.playoff_teams ?? 4);
    const median = Number(info.settings?.league_average_match ?? 0) === 1;

    const [users, rosters, bracket] = await Promise.all([
      getLeagueUsers(leagueId).catch(() => [] as any[]),
      getLeagueRosters(leagueId).catch(() => [] as any[]),
      getPlayoffBracket(leagueId).catch(() => null),
    ]);
    if (!rosters.length) continue;
    seasonsSeen.push(season);

    /**
     * Which playoff round each week belongs to, and who was in it.
     *
     * Every game from the playoff start week on used to count as a playoff
     * game, consolation games included. And in a two week round each week
     * was scored as a separate win or loss, though the round is decided on
     * the combined total: this league's title is won over weeks 16 and 17
     * together. The bracket is the authority on both.
     */
    const roundWeeks = playoffRoundWeeks(
      playoffStart - 1, playoffTeams, Number(info.settings?.playoff_round_type ?? 0));
    const roundOfWeek = new Map<number, { round: number; last: boolean }>();
    roundWeeks.forEach((ws, i) => ws.forEach((w, j) => roundOfWeek.set(w, { round: i + 1, last: j === ws.length - 1 })));
    const winners: any[] = Array.isArray(bracket?.winners_bracket) ? bracket.winners_bracket : [];
    const bracketMatch = (round: number, rosterId: number) =>
      winners.find((b: any) => b.r === round && (b.t1 === rosterId || b.t2 === rosterId));

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
    const rosterOwner = new Map<number, string>(rosters.map((r: any) => [r.roster_id, r.owner_id]));
    const managerOf = (rosterId: number) => {
      const owner = rosterOwner.get(rosterId) ?? '';
      return managerNow.get(owner) ?? userById.get(owner)?.display_name ?? `Team ${rosterId}`;
    };
    const teamOf = (rosterId: number) => {
      const owner = rosterOwner.get(rosterId) ?? '';
      return teamNameNow.get(owner) ?? userById.get(owner)?.metadata?.team_name ?? managerOf(rosterId);
    };

    // ── Weeks: final only ────────────────────────────────────────────────────
    const weeks: number[] = [];
    for (let w = 1; w <= lastWeek; w++) weeks.push(w);
    const finalWeeks = isCurrent
      ? (await Promise.all(weeks.map(async w =>
          ((await weekPhase(season, w).catch(() => 'upcoming')) === 'final' ? w : 0)))).filter(Boolean)
      : weeks;

    const weekRows = await Promise.all(finalWeeks.map(async w =>
      ({ w, rows: await getLeagueMatchups(leagueId, w).catch(() => [] as any[]) })));

    for (const { w, rows } of weekRows) {
      const played = rows.filter((m: any) => m.matchup_id != null && Number(m.points ?? 0) > 0);
      if (!played.length) continue;
      const isPlayoff = w >= playoffStart;
      const scores = played.map((m: any) => Number(m.points)).sort((a: number, b: number) => a - b);
      const mid = scores.length / 2;
      const medianScore = scores.length % 2 ? scores[Math.floor(mid)] : (scores[mid - 1] + scores[mid]) / 2;
      const top = scores[scores.length - 1];
      const byMatch = new Map<number, any[]>();
      for (const m of played) byMatch.set(m.matchup_id, [...(byMatch.get(m.matchup_id) ?? []), m]);

      for (const m of played) {
        const opp = (byMatch.get(m.matchup_id) ?? []).find((x: any) => x.roster_id !== m.roster_id);
        const pts = Number(m.points);
        const oppPts = opp ? Number(opp.points) : null;
        const starters = new Set<string>((m.starters ?? []).filter((id: string) => id && id !== '0'));
        const pp: Record<string, number> = m.players_points ?? {};
        let bench = 0;

        for (const pid of (m.players ?? []) as string[]) {
          const p = Number(pp[pid] ?? 0);
          const started = starters.has(pid);
          if (!started) bench += p;
          const meta = players[pid] ?? {};
          out.players.push({
            season, week: w, manager: managerOf(m.roster_id), team: teamOf(m.roster_id),
            player: playerName(pid), position: meta.position ?? null, nfl_team: meta.team ?? null,
            started, points: r1(p), started_points: started ? r1(p) : 0, bench_points: started ? 0 : r1(p),
          });
          const k = `${season}|${pid}`;
          seasonPoints.set(k, (seasonPoints.get(k) ?? 0) + p);
        }

        // Head to head result. In the playoffs, from the bracket: a multi week
        // round has one result, recorded on its last week.
        let result: string | null = oppPts == null ? null : pts > oppPts ? 'Win' : pts < oppPts ? 'Loss' : 'Tie';
        let phase = 'Regular season';
        if (isPlayoff) {
          const ro = roundOfWeek.get(w);
          const match = ro ? bracketMatch(ro.round, m.roster_id) : null;
          phase = match ? 'Playoffs' : 'Consolation';
          if (match && ro) {
            result = !ro.last ? null
              : match.w === m.roster_id ? 'Win' : match.l === m.roster_id ? 'Loss' : null;
          }
        }

        out.matchups.push({
          season, week: w, phase,
          manager: managerOf(m.roster_id), team: teamOf(m.roster_id),
          opponent: opp ? managerOf(opp.roster_id) : null,
          result,
          // The median game only exists in the regular season.
          beat_median: median && !isPlayoff ? pts > medianScore : null,
          top_score: pts === top,
          points: r1(pts), opp_points: oppPts == null ? null : r1(oppPts),
          margin: oppPts == null ? null : r1(pts - oppPts),
          // Null, not 0, where there is no result, so it drops out of win rates.
          win: result == null ? null : result === 'Win' ? 1 : 0,
          bench_points: r1(bench),
        });
      }
    }

    // ── Seasons ──────────────────────────────────────────────────────────────
    const championRoster = (() => {
      const winners: any[] = Array.isArray(bracket?.winners_bracket) ? bracket.winners_bracket : [];
      const final = winners.find((b: any) => b.p === 1);
      return final?.w ?? null;
    })();
    const standings = rosters.map((r: any) => {
      const s = r.settings ?? {};
      const wins = Number(s.wins ?? 0), losses = Number(s.losses ?? 0), ties = Number(s.ties ?? 0);
      return {
        r, wins, losses, ties,
        pf: Number(s.fpts ?? 0) + Number(s.fpts_decimal ?? 0) / 100,
        pa: Number(s.fpts_against ?? 0) + Number(s.fpts_against_decimal ?? 0) / 100,
      };
    }).sort((a: any, b: any) => b.wins - a.wins || b.pf - a.pf);
    const weeksPlayed = new Set(out.matchups.filter(m => m.season === season && m.phase === 'Regular season').map(m => m.week)).size;

    standings.forEach((t: any, i: number) => {
      const games = t.wins + t.losses + t.ties;
      if (!games) return;
      // In-progress seasons have no champion; the bracket is not decided.
      const champ = !isCurrent && championRoster === t.r.roster_id;
      out.seasons.push({
        season, manager: managerOf(t.r.roster_id), team: teamOf(t.r.roster_id),
        made_playoffs: i < playoffTeams, champion: champ,
        wins: t.wins, losses: t.losses, win_pct: r1(games ? (t.wins + t.ties / 2) / games : 0),
        points_for: r1(t.pf), points_against: r1(t.pa),
        ppg: r1(weeksPlayed ? t.pf / weeksPlayed : 0),
        finish: i + 1, titles: champ ? 1 : 0,
      });
    });

    // ── Transactions ─────────────────────────────────────────────────────────
    const txns = await getSeasonTransactions(leagueId, lastWeek).catch(() => [] as any[]);
    for (const t of txns as any[]) {
      const month = t.created ? new Date(t.created).toISOString().slice(0, 7) : null;
      for (const rid of (t.roster_ids ?? []) as number[]) {
        const adds = Object.entries(t.adds ?? {}).filter(([, r]) => r === rid).map(([pid]) => pid);
        const drops = Object.entries(t.drops ?? {}).filter(([, r]) => r === rid).map(([pid]) => pid);
        const picks = (t.draft_picks ?? []).filter((p: any) => p.owner_id === rid || p.previous_owner_id === rid).length;
        out.transactions.push({
          season, week: Number(t.leg ?? 0) || null, month,
          manager: managerOf(rid), team: teamOf(rid),
          type: TYPE_LABEL[t.type] ?? t.type,
          added: adds.map(playerName).join(', ') || null,
          dropped: drops.map(playerName).join(', ') || null,
          moves: 1, adds: adds.length, drops: drops.length,
          faab: t.type === 'waiver' && adds.length ? Number(t.settings?.waiver_bid ?? 0) : 0,
          picks_moved: t.type === 'trade' ? picks : 0,
        });
      }
    }

    // ── Draft ────────────────────────────────────────────────────────────────
    if (info.draft_id) {
      const picks: any[] = await fetch(`https://api.sleeper.app/v1/draft/${info.draft_id}/picks`)
        .then(r => (r.ok ? r.json() : [])).catch(() => []);
      for (const p of picks ?? []) {
        // picked_by is a user; fall back to the roster when it is blank, which
        // Sleeper leaves for autopicks on some drafts.
        const userId = p.picked_by || rosterOwner.get(p.roster_id) || '';
        const u = userById.get(userId);
        out.drafts.push({
          season, round: Number(p.round), pick: Number(p.pick_no),
          manager: managerNow.get(userId) ?? u?.display_name ?? `Team ${p.roster_id}`,
          team: teamNameNow.get(userId) ?? u?.metadata?.team_name ?? u?.display_name ?? null,
          player: p.player_id ? playerName(p.player_id) : [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(' '),
          position: p.metadata?.position ?? players[p.player_id]?.position ?? null,
          season_points: 0, picks: 1,
          _pid: p.player_id ?? null,
        } as Row);
      }
    }
  }

  // Joined last, once every season's player weeks exist.
  for (const d of out.drafts) {
    d.season_points = r1(seasonPoints.get(`${d.season}|${d._pid}`) ?? 0);
    delete d._pid;
  }

  out.seasonList = seasonsSeen.sort();
  return out;
}
