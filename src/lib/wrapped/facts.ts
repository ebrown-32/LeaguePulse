/**
 * What the rest of the site already knows about each manager, for League Wrapped: so a story
 * never disagrees with the History page, a team's profile, the Rivalries page or Next Gen.
 *
 *   titles     champions, runners-up and regular-season titles: the History page's
 *              (lib/enhancedHistoryApi), decided from the playoff bracket
 *   finishes   where each team finished each season, the same source
 *   playoffs   decided title-bracket games only (lib/playoffsCore), as team profiles count them
 *   records    every Record Book entry a manager holds, with its rank (lib/enhancedHistoryApi)
 *   rivals     head to head as the Rivalries page counts it (lib/rivalries), every game tagged
 *              regular season, playoffs or consolation
 *   next gen   consistency, explosiveness, clutch, efficiency, momentum and luck (Next Gen)
 *   legacy     the History page's ranking of managers (lib/legacy), all time only
 *
 * Expensive (it reads every season), so kept per league and scope for half an hour. Server only;
 * call inside the league's request.
 */

import type { EnhancedHistoricalRecord } from '@/lib/enhancedHistoryApi';

export interface RecordHeld { type: string; season: string; week: number | null; value: number; rank: number; description: string; detail: string | null; stage: 'playoffs' | 'consolation' | null }
export interface RivalFact { id: string; name: string; w: number; l: number; t: number; games: number; playoffW: number; playoffL: number }

export interface ManagerFacts {
  /** The record the profile and History page show (wins include median games where played), in scope. */
  record: { w: number; l: number; t: number };
  seasonRecords: Record<string, { w: number; l: number; t: number }>;
  titles: string[];
  runnerUps: string[];
  regularSeasonTitles: string[];
  finishes: { season: string; finish: number }[];
  playoffAppearances: number;
  playoffRecord: { w: number; l: number };
  records: RecordHeld[];
  rivals: RivalFact[];
  nextGen: { consistency: number; explosiveness: number; clutch: number; efficiency: number; momentum: number; luck: number } | null;
  legacy: { rank: number; of: number; score: number } | null;
}

/** A game the Record Book holds: who scored what against whom. */
export interface BookGame { season: number; week: number; ownerId: string; pts: number; opp: number; oppId: string; oppName: string; stage: RecordHeld['stage'] }

export interface LeagueFacts {
  champions: { season: string; ownerId: string }[];
  /** The Record Book's top game in scope for the highest score, the biggest blowout and the closest game. */
  games?: { best: BookGame | null; blowout: BookGame | null; closest: BookGame | null };
  /** The Record Book's #1 in every list: set this season, or all time. */
  records: (RecordHeld & { ownerId: string; name: string })[];
}

export interface Facts { managers: Record<string, ManagerFacts>; league: LeagueFacts; names: Record<string, string> }

/** The Record Book lists that are themselves achievements, told elsewhere in a story. */
const NOT_RECORDS = new Set(['championship', 'runnerUp', 'regularSeasonChamp', 'playoffAppearance', 'championshipGame']);
const TTL_MS = 30 * 60_000;
const memo = new Map<string, { at: number; value: Promise<Facts> }>();

export function historyFacts(cacheKey: string, season: number | null): Promise<Facts> {
  const key = `${cacheKey}:${season ?? 'all'}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = build(season).catch(err => { memo.delete(key); throw err; });
  memo.set(key, { at: Date.now(), value });
  return value;
}

async function build(season: number | null): Promise<Facts> {
  const [{ getCurrentLeagueId }, { generateEnhancedLeagueHistory }, api, { fetchRivalriesData }, { playoffHistory }, { playoffRecords }, { rankByLegacy }] = await Promise.all([
    import('@/config/league'), import('@/lib/enhancedHistoryApi'), import('@/lib/api'), import('@/lib/rivalries'),
    import('@/lib/playoffs'), import('@/lib/playoffsCore'), import('@/lib/legacy'),
  ]);
  const leagueId = await getCurrentLeagueId();
  const s = season === null ? null : String(season);
  const [history, rivalries, playoffs, advanced] = await Promise.all([
    generateEnhancedLeagueHistory(leagueId),
    fetchRivalriesData().catch(() => null),
    playoffHistory(leagueId).catch(() => []),
    api.getAdvancedTeamMetrics(leagueId, s ?? 'all-time').catch(() => []),
  ]);

  const names: Record<string, string> = {};
  for (const u of history.allTimeStats) names[u.userId] = u.username;
  const inScope = (r: EnhancedHistoricalRecord) => s === null || r.season === s;
  const of = (type: string) => history.records.filter(r => r.type === type && inScope(r));

  const held = (r: EnhancedHistoricalRecord): RecordHeld => ({
    type: r.type, season: r.season, week: r.week ?? null, value: r.value, rank: r.contextualRank ?? 99,
    description: r.description,
    detail: r.details?.player ? `${r.details.player}${r.details.position ? ` (${r.details.position})` : ''}` : r.details?.record ?? null,
    stage: r.isPlayoff ? 'playoffs' : r.isConsolation ? 'consolation' : null,
  });

  /** The Record Book's best entry of a kind in scope, as a game (null without its opponent). */
  const topGame = (type: string): BookGame | null => {
    const r = of(type).sort((a, b) => (a.contextualRank ?? 99) - (b.contextualRank ?? 99))[0];
    const d = r?.details;
    if (!r || r.week == null || !d?.opponentId || d.winnerScore == null || d.loserScore == null) return null;
    // A high score can lose; the rest are the winner's.
    const pts = type === 'highScore' ? r.value : d.winnerScore;
    const opp = type === 'highScore' ? (d.winnerScore === r.value ? d.loserScore : d.winnerScore) : d.loserScore;
    return { season: Number(r.season), week: r.week, ownerId: r.userId, pts, opp, oppId: d.opponentId, oppName: names[d.opponentId] ?? d.opponent ?? 'A manager', stage: held(r).stage };
  };

  const playoffRec = playoffRecords(s === null ? playoffs : playoffs.filter(x => String(x.season) === s));
  const legacy = s === null ? rankByLegacy(history.allTimeStats) : [];

  const managers: Record<string, ManagerFacts> = {};
  for (const u of history.allTimeStats) {
    const seasons = Object.entries(u.seasonBySeasonStats).filter(([k]) => s === null || k === s);
    if (!seasons.length) continue;
    const h2h = rivalries?.h2h[u.userId] ?? {};
    const rivals: RivalFact[] = Object.entries(h2h).map(([opp, e]) => {
      const games = e.games.filter(g => s === null || g.season === s);
      const w = games.filter(g => g.score > g.opponentScore).length, l = games.filter(g => g.score < g.opponentScore).length;
      const po = games.filter(g => g.isPlayoff);
      return {
        id: opp, name: names[opp] ?? 'A manager', w, l, t: games.length - w - l, games: games.length,
        playoffW: po.filter(g => g.score > g.opponentScore).length, playoffL: po.filter(g => g.score < g.opponentScore).length,
      };
    }).filter(r => r.games > 0);
    const ng = advanced.find(a => a.userId === u.userId);
    const lg = legacy.findIndex(m => m.userId === u.userId);
    const seasonRecords = Object.fromEntries(seasons.map(([k, v]) => [k, { w: v.wins, l: v.losses, t: v.ties }]));
    managers[u.userId] = {
      record: seasons.reduce((r, [, v]) => ({ w: r.w + v.wins, l: r.l + v.losses, t: r.t + v.ties }), { w: 0, l: 0, t: 0 }),
      seasonRecords,
      titles: of('championship').filter(r => r.userId === u.userId).map(r => r.season),
      runnerUps: of('runnerUp').filter(r => r.userId === u.userId).map(r => r.season),
      regularSeasonTitles: of('regularSeasonChamp').filter(r => r.userId === u.userId).map(r => r.season),
      finishes: seasons.map(([k, v]) => ({ season: k, finish: v.finish })).filter(f => f.finish > 0),
      playoffAppearances: seasons.filter(([, v]) => v.playoffAppearance || v.championship || v.regularSeasonChamp).length,
      playoffRecord: { w: playoffRec.get(u.userId)?.wins ?? 0, l: playoffRec.get(u.userId)?.losses ?? 0 },
      records: history.records.filter(r => r.userId === u.userId && inScope(r) && !NOT_RECORDS.has(r.type))
        .sort((a, b) => (a.contextualRank ?? 99) - (b.contextualRank ?? 99)).map(held),
      rivals,
      nextGen: ng ? {
        consistency: Math.round(ng.consistency.score), explosiveness: Math.round(ng.explosiveness.score), clutch: Math.round(ng.clutch.score),
        efficiency: Math.round(ng.efficiency.score), momentum: Math.round(ng.momentum.score), luck: Math.round(ng.luck.score),
      } : null,
      legacy: lg >= 0 ? { rank: lg + 1, of: legacy.length, score: legacy[lg].legacy.score } : null,
    };
  }

  return {
    managers,
    names,
    league: {
      games: { best: topGame('highScore'), blowout: topGame('blowout'), closest: topGame('closeGame') },
      champions: of('championship').map(r => ({ season: r.season, ownerId: r.userId })).sort((a, b) => Number(b.season) - Number(a.season)),
      records: history.records.filter(r => inScope(r) && !NOT_RECORDS.has(r.type) && r.contextualRank === 1)
        .map(r => ({ ...held(r), ownerId: r.userId, name: names[r.userId] ?? r.username })),
    },
  };
}
