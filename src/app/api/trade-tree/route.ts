import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds } from '@/lib/api';

export const dynamic = 'force-dynamic';

const BASE = 'https://api.sleeper.app/v1';

// Module-level caches, survive across requests within a warm serverless instance.
let playersCache: { data: Record<string, any>; ts: number } | null = null;
const PLAYERS_TTL_MS = 86_400_000; // 24 h

let responseCache: { data: TradeTreeResponse; ts: number } | null = null;
const RESPONSE_TTL_MS = 900_000; // 15 min, this route aggregates a lot of Sleeper calls

/**
 * This route fans out to ~50 Sleeper calls per season; transient failures would
 * silently degrade results (e.g. picks showing as untraceable), so retry.
 */
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

async function fetchAllPlayers(): Promise<Record<string, any>> {
  if (playersCache && Date.now() - playersCache.ts < PLAYERS_TTL_MS) {
    return playersCache.data;
  }
  const data = await fetchJson<Record<string, any>>(`${BASE}/players/nfl`, { cache: 'no-store' }, {});
  playersCache = { data, ts: Date.now() };
  return data;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface PlayerSummary {
  id: string;
  name: string;
  position: string;
  nflTeam: string;
}

export interface WeeklyPoints {
  season: string;
  week: number;
  pts: number;
  started: boolean;
}

export interface JourneyEvent {
  kind: 'traded' | 'dropped' | 'waived' | 'signed';
  season: string;
  week: number;
  isOffseason: boolean;
  fromTeam: string | null;
  toTeam: string | null;
  tradeId: string | null; // set when kind === 'traded' → deep-link to that trade card
}

export interface PickInfo {
  season: string;
  round: number;
  status: 'resolved' | 'pending' | 'unknown';
  /** Player eventually selected with this pick (resolved only) */
  became: PlayerSummary | null;
  pickNo: number | null;
}

export interface AssetResult {
  kind: 'player' | 'pick';
  player: PlayerSummary | null;  // the traded player, or the player a pick became
  pick: PickInfo | null;
  totalPoints: number;
  starterPoints: number;
  gamesRostered: number;
  gamesStarted: number;
  weekly: WeeklyPoints[];
  journey: JourneyEvent[];
  /** Where the asset stands today, e.g. "Still on Team X" / "Dropped Wk 9 '25" */
  fate: string;
  stillHeld: boolean;
}

export interface TradeSideResult {
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
  assets: AssetResult[];
  totalPoints: number;
}

export type OutcomeStatus = 'pending' | 'settled';

/** Objective accounting of the trade: no editorializing, just the numbers. */
export interface TradeOutcome {
  /** 'pending' while a side's return hasn't materialized yet (undrafted picks,
   *  rookies still in their first season, or fewer than 3 scored weeks) */
  status: OutcomeStatus;
  /** Side currently ahead on points delivered; null when tied or pending */
  leaderRosterId: number | null;
  margin: number;
  /** Leader's share of the points exchanged, 0.5–1 (for the differential bar) */
  share: number;
  scoredWeeksSince: number;
}

export interface TradeTreeEntry {
  transactionId: string;
  created: number;
  week: number;
  season: string;
  isOffseason: boolean;
  sides: TradeSideResult[];
  outcome: TradeOutcome;
}

export interface TradeTreeResponse {
  trades: TradeTreeEntry[];
  seasons: string[];
}

// ── Internal season model ─────────────────────────────────────────────────────

interface WeekRoster {
  players: Set<string>;
  points: Record<string, number>;
  starters: Set<string>;
}

interface SeasonData {
  season: string;
  leagueId: string;
  status: string;
  isOffseason: boolean;
  lastScoredWeek: number;
  rosters: any[];
  users: any[];
  ownerByRoster: Map<number, string>;
  rosterByOwner: Map<string, number>;
  teamNameByRoster: Map<number, string>;
  avatarByRoster: Map<number, string>;
  /** week → rosterId → who was on the roster and what they scored */
  weeks: Map<number, Map<number, WeekRoster>>;
  rawTxs: any[];
  draft: { slotToRoster: Record<string, number>; picks: any[] } | null;
}

function resolvePlayer(pid: string, allPlayers: Record<string, any>): PlayerSummary {
  const meta = allPlayers[pid];
  return {
    id: pid,
    name: meta ? `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() : `Player ${pid}`,
    position: meta?.fantasy_positions?.[0] ?? meta?.position ?? '?',
    nflTeam: meta?.team ?? 'FA',
  };
}

async function loadSeason(leagueId: string, currentNFLWeek: number): Promise<SeasonData> {
  const [info, rosters, users] = await Promise.all([
    fetchJson<any>(`${BASE}/league/${leagueId}`, { next: { revalidate: 86400 } }, {}),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 3600 } }, []),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/users`,   { next: { revalidate: 3600 } }, []),
  ]);

  const season = info.season as string;
  const status = info.status as string;
  const isOffseason = status === 'pre_draft';
  const isActive    = status === 'in_season' || status === 'post_season' || status === 'drafting';
  const isComplete  = status === 'complete';

  const lastScoredWeek = Math.min(22, Math.max(0, info.settings?.last_scored_leg ?? (isComplete ? 22 : 0)));
  const txMaxWeek = (isOffseason || isActive) ? Math.max(1, currentNFLWeek) : 22;

  // Completed seasons never change, cache aggressively. Live seasons must stay fresh.
  const fetchOpts: RequestInit = isComplete
    ? { next: { revalidate: 86400 } }
    : { cache: 'no-store' };

  const [txBatches, matchupBatches, drafts] = await Promise.all([
    Promise.all(Array.from({ length: txMaxWeek }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/transactions/${i + 1}`, fetchOpts, [])
    )),
    Promise.all(Array.from({ length: lastScoredWeek }, (_, i) =>
      fetchJson<any[]>(`${BASE}/league/${leagueId}/matchups/${i + 1}`, fetchOpts, [])
    )),
    fetchJson<any[]>(`${BASE}/league/${leagueId}/drafts`, fetchOpts, []),
  ]);

  // Draft picks: resolve traded picks to the player eventually selected.
  // slot_to_roster_id is only present on the draft *detail* endpoint, not the list.
  let draft: SeasonData['draft'] = null;
  const completedDraft = (drafts ?? []).find((d: any) => d.status === 'complete');
  if (completedDraft) {
    const [detail, picks] = await Promise.all([
      fetchJson<any>(`${BASE}/draft/${completedDraft.draft_id}`, fetchOpts, null),
      fetchJson<any[]>(`${BASE}/draft/${completedDraft.draft_id}/picks`, fetchOpts, []),
    ]);
    const slotToRoster = detail?.slot_to_roster_id ?? completedDraft.slot_to_roster_id;
    if (slotToRoster) draft = { slotToRoster, picks };
  }

  const ownerByRoster = new Map<number, string>((rosters ?? []).map((r: any) => [r.roster_id, r.owner_id]));
  const rosterByOwner = new Map<string, number>((rosters ?? []).map((r: any) => [r.owner_id, r.roster_id]));
  const userById = new Map<string, any>((users ?? []).map((u: any) => [u.user_id, u]));
  const teamNameByRoster = new Map<number, string>();
  const avatarByRoster = new Map<number, string>();
  for (const r of rosters ?? []) {
    const u = userById.get(r.owner_id);
    teamNameByRoster.set(r.roster_id, u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`);
    avatarByRoster.set(r.roster_id, u?.avatar || '');
  }

  const weeks = new Map<number, Map<number, WeekRoster>>();
  matchupBatches.forEach((matchups: any[], i: number) => {
    const week = i + 1;
    const byRoster = new Map<number, WeekRoster>();
    for (const m of matchups ?? []) {
      byRoster.set(m.roster_id, {
        players: new Set<string>(m.players ?? []),
        points: m.players_points ?? {},
        starters: new Set<string>((m.starters ?? []).filter((s: string) => s && s !== '0')),
      });
    }
    weeks.set(week, byRoster);
  });

  const rawTxs = txBatches.flat().filter((t: any) =>
    t.status === 'complete' && ['trade', 'free_agent', 'waiver'].includes(t.type)
  );

  return {
    season, leagueId, status, isOffseason, lastScoredWeek,
    rosters: rosters ?? [], users: users ?? [],
    ownerByRoster, rosterByOwner, teamNameByRoster, avatarByRoster,
    weeks, rawTxs, draft,
  };
}

// ── Production accumulation ───────────────────────────────────────────────────

/**
 * Sum everything a player scored for one owner starting at (seasonIdx, startWeek),
 * following the owner's roster into later seasons while the player stays on it.
 * Stops permanently the first time a scored week shows the player off the roster.
 *
 * Roster snapshots lag the trade itself: a trade that clears after a week's
 * matchups have locked won't show the new owner until the *following* week's
 * snapshot, even though the trade's own `leg` says otherwise. So we don't treat
 * "not on the roster yet" as a departure until the player has actually shown up
 * on this owner's roster at least once. Only after that first sighting does a
 * later absence count as the asset having moved on.
 */
function accumulateProduction(
  seasons: SeasonData[],
  seasonIdx: number,
  startWeek: number,
  ownerId: string,
  playerId: string,
): { totalPoints: number; starterPoints: number; gamesRostered: number; gamesStarted: number; weekly: WeeklyPoints[]; stillHeld: boolean } {
  let totalPoints = 0, starterPoints = 0, gamesRostered = 0, gamesStarted = 0;
  const weekly: WeeklyPoints[] = [];
  let arrived = false;
  let departed = false;

  for (let si = seasonIdx; si < seasons.length && !departed; si++) {
    const s = seasons[si];
    const rosterId = s.rosterByOwner.get(ownerId);
    if (rosterId === undefined) break; // owner left the league
    const from = si === seasonIdx ? Math.max(1, startWeek) : 1;

    for (let w = from; w <= s.lastScoredWeek; w++) {
      const wr = s.weeks.get(w)?.get(rosterId);
      if (!wr) continue; // no matchup entry (bye/eliminated), can't tell, skip the week
      if (!wr.players.has(playerId)) {
        if (arrived) { departed = true; break; }
        continue; // trade hasn't shown up in the roster snapshot yet, keep waiting
      }
      arrived = true;
      const pts = wr.points[playerId] ?? 0;
      const started = wr.starters.has(playerId);
      totalPoints += pts;
      gamesRostered += 1;
      if (started) { gamesStarted += 1; starterPoints += pts; }
      weekly.push({ season: s.season, week: w, pts: Math.round(pts * 10) / 10, started });
    }
  }

  return {
    totalPoints: Math.round(totalPoints * 10) / 10,
    starterPoints: Math.round(starterPoints * 10) / 10,
    gamesRostered, gamesStarted, weekly,
    stillHeld: !departed,
  };
}

// ── Asset journeys (the tree) ─────────────────────────────────────────────────

interface TxIndexEntry {
  tradeId: string;
  type: string;
  created: number;
  season: string;
  week: number;
  isOffseason: boolean;
  adds: Record<string, number>;
  drops: Record<string, number>;
  teamName: (rosterId: number) => string;
}

/** Every move a player makes after a point in time, league-wide, in order. */
function traceJourney(txIndex: TxIndexEntry[], playerId: string, afterTs: number): JourneyEvent[] {
  const events: JourneyEvent[] = [];
  for (const tx of txIndex) {
    if (tx.created <= afterTs) continue;
    const addedTo = tx.adds[playerId];
    const droppedFrom = tx.drops[playerId];
    if (addedTo === undefined && droppedFrom === undefined) continue;

    let kind: JourneyEvent['kind'];
    if (tx.type === 'trade') kind = 'traded';
    else if (droppedFrom !== undefined && addedTo === undefined) kind = 'dropped';
    else kind = tx.type === 'waiver' ? 'waived' : 'signed';

    events.push({
      kind,
      season: tx.season,
      week: tx.week,
      isOffseason: tx.isOffseason,
      fromTeam: droppedFrom !== undefined ? tx.teamName(droppedFrom) : null,
      toTeam: addedTo !== undefined ? tx.teamName(addedTo) : null,
      tradeId: tx.type === 'trade' ? tx.tradeId : null,
    });
    if (events.length >= 8) break;
  }
  return events;
}

/** A future pick changing hands in a later trade, keyed by (season, round, original owner). */
interface PickMove {
  key: string;
  created: number;
  tradeId: string;
  season: string;
  week: number;
  isOffseason: boolean;
  fromTeam: string | null;
  toTeam: string | null;
}

function describeFate(
  journey: JourneyEvent[],
  stillHeld: boolean,
  acquiringTeam: string,
  latest: SeasonData | undefined,
  playerId: string,
): string {
  // The player starts on the acquiring roster, so the first move after the trade
  // is necessarily the departure from it.
  const departure = journey[0];
  if (!departure && stillHeld) return `Still on ${acquiringTeam}`;
  if (departure) {
    const when = departure.isOffseason ? `'${departure.season.slice(2)} offseason` : `Wk ${departure.week} '${departure.season.slice(2)}`;
    if (departure.kind === 'traded') return `Traded to ${departure.toTeam ?? '?'} · ${when}`;
    return `Dropped · ${when}`;
  }
  // Fallback: look at where the player is right now
  if (latest) {
    for (const r of latest.rosters) {
      if ((r.players ?? []).includes(playerId)) {
        return `Now on ${latest.teamNameByRoster.get(r.roster_id) ?? 'another team'}`;
      }
    }
  }
  return 'Free agent';
}

// ── Pick resolution ───────────────────────────────────────────────────────────

function resolvePick(
  seasons: SeasonData[],
  tradingSeason: SeasonData,
  pickSeason: string,
  round: number,
  originalOwnerRosterId: number,
  allPlayers: Record<string, any>,
): PickInfo & { drafterOwnerId?: string; draftSeasonIdx?: number; playerId?: string } {
  const base: PickInfo = { season: pickSeason, round, status: 'pending', became: null, pickNo: null };
  const idx = seasons.findIndex(s => s.season === pickSeason);
  if (idx === -1) return base; // future season not created yet
  const target = seasons[idx];
  if (!target.draft) return { ...base, status: target.status === 'complete' ? 'unknown' : 'pending' };

  // Original owner's draft slot: map roster→owner in the trading league, then
  // owner→roster in the draft-year league (roster ids can shift between seasons).
  const ownerId = tradingSeason.ownerByRoster.get(originalOwnerRosterId);
  const rosterInDraftSeason = ownerId !== undefined ? target.rosterByOwner.get(ownerId) : originalOwnerRosterId;
  const slotEntry = Object.entries(target.draft.slotToRoster)
    .find(([, rid]) => rid === (rosterInDraftSeason ?? originalOwnerRosterId));
  if (!slotEntry) return { ...base, status: 'unknown' };

  const slot = Number(slotEntry[0]);
  const pick = target.draft.picks.find((p: any) => p.round === round && p.draft_slot === slot);
  if (!pick?.player_id) return { ...base, status: 'unknown' };

  return {
    season: pickSeason,
    round,
    status: 'resolved',
    became: resolvePlayer(pick.player_id, allPlayers),
    pickNo: pick.pick_no ?? null,
    drafterOwnerId: target.ownerByRoster.get(pick.roster_id),
    draftSeasonIdx: idx,
    playerId: pick.player_id,
  };
}

// ── Verdict ───────────────────────────────────────────────────────────────────

/**
 * Dynasty-aware accounting. Raw cumulative points systematically favor the
 * win-now side of a trade, so the outcome stays 'pending' while a trailing side
 * holds undrafted picks or rookies from those picks are still in their first
 * (live) season, since the return hasn't materialized yet. Beyond that, we
 * report the numbers and let the reader judge.
 */
function computeOutcome(
  sides: TradeSideResult[],
  scoredWeeksSince: number,
  seasonLive: boolean,
  liveSeason: string | null,
): TradeOutcome {
  const sorted = [...sides].sort((a, b) => b.totalPoints - a.totalPoints);
  const top = sorted[0], second = sorted[1];
  const margin = Math.round(((top?.totalPoints ?? 0) - (second?.totalPoints ?? 0)) * 10) / 10;
  const exchanged = (top?.totalPoints ?? 0) + (second?.totalPoints ?? 0);
  const share = exchanged > 0 ? (top?.totalPoints ?? 0) / exchanged : 0.5;

  const trailingReturnPending = sorted.slice(1).some(side =>
    side.assets.some(a =>
      a.kind === 'pick' && a.journey.length === 0 && a.pick != null && (
        a.pick.status === 'pending' ||
        (a.pick.status === 'resolved' && liveSeason !== null && a.pick.season === liveSeason)
      )
    )
  );

  const pending = (seasonLive && scoredWeeksSince < 3) || trailingReturnPending;

  return {
    status: pending ? 'pending' : 'settled',
    leaderRosterId: pending || margin === 0 ? null : top.rosterId,
    margin,
    share: Math.round(share * 1000) / 1000,
    scoredWeeksSince,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  if (responseCache && Date.now() - responseCache.ts < RESPONSE_TTL_MS) {
    return NextResponse.json(responseCache.data);
  }

  try {
    const [nflState, allLeagueIds, allPlayers] = await Promise.all([
      fetch(`${BASE}/state/nfl`, { cache: 'no-store' }).then(r => r.json()),
      getAllLinkedLeagueIds(initialId),
      fetchAllPlayers(),
    ]);
    const currentNFLWeek = Math.max(1, nflState.week ?? 1);

    const seasons = (await Promise.all(allLeagueIds.map(id => loadSeason(id, currentNFLWeek))))
      .sort((a, b) => Number(a.season) - Number(b.season));

    // Global transaction index (all types) for tracing asset journeys
    const txIndex: TxIndexEntry[] = seasons
      .flatMap(s => s.rawTxs.map((tx: any) => ({
        tradeId: tx.transaction_id as string,
        type: tx.type as string,
        created: tx.created as number,
        season: s.season,
        week: tx.leg ?? 1,
        isOffseason: s.isOffseason,
        adds: (tx.adds ?? {}) as Record<string, number>,
        drops: (tx.drops ?? {}) as Record<string, number>,
        teamName: (rosterId: number) => s.teamNameByRoster.get(rosterId) ?? `Team ${rosterId}`,
      })))
      .sort((a, b) => a.created - b.created);

    // Pick-move index: picks can be flipped again before the draft happens.
    // Keyed by owner (not roster id) so the key survives across linked seasons.
    const pickMoves: PickMove[] = seasons
      .flatMap(s => s.rawTxs
        .filter((tx: any) => tx.type === 'trade')
        .flatMap((tx: any) => ((tx.draft_picks ?? []) as any[]).map(dp => ({
          key: `${dp.season}|${dp.round}|${s.ownerByRoster.get(dp.roster_id) ?? dp.roster_id}`,
          created: tx.created as number,
          tradeId: tx.transaction_id as string,
          season: s.season,
          week: tx.leg ?? 1,
          isOffseason: s.isOffseason,
          fromTeam: s.teamNameByRoster.get(dp.previous_owner_id) ?? null,
          toTeam: s.teamNameByRoster.get(dp.owner_id) ?? null,
        }))))
      .sort((a, b) => a.created - b.created);

    const latest = seasons[seasons.length - 1];
    const liveSeason = seasons.find(s => s.status !== 'complete')?.season ?? null;
    const trades: TradeTreeEntry[] = [];

    seasons.forEach((s, seasonIdx) => {
      const seasonLive = s.status !== 'complete';
      for (const tx of s.rawTxs) {
        if (tx.type !== 'trade') continue;
        const rosterIds: number[] = tx.roster_ids ?? [];
        if (rosterIds.length < 2) continue;
        const adds: Record<string, number> = tx.adds ?? {};
        const picks: any[] = tx.draft_picks ?? [];
        const tradeWeek = Math.max(1, tx.leg ?? 1);
        // Offseason trades start producing in week 1 of the season
        const startWeek = s.isOffseason ? 1 : tradeWeek;

        const sides: TradeSideResult[] = rosterIds.map(rosterId => {
          const ownerId = s.ownerByRoster.get(rosterId) ?? '';
          const teamName = s.teamNameByRoster.get(rosterId) ?? `Team ${rosterId}`;
          const assets: AssetResult[] = [];

          // Players received
          for (const [pid, rid] of Object.entries(adds)) {
            if (rid !== rosterId) continue;
            const prod = accumulateProduction(seasons, seasonIdx, startWeek, ownerId, pid);
            const journey = traceJourney(txIndex, pid, tx.created);
            assets.push({
              kind: 'player',
              player: resolvePlayer(pid, allPlayers),
              pick: null,
              totalPoints: prod.totalPoints,
              starterPoints: prod.starterPoints,
              gamesRostered: prod.gamesRostered,
              gamesStarted: prod.gamesStarted,
              weekly: prod.weekly,
              journey,
              fate: describeFate(journey, prod.stillHeld, teamName, latest, pid),
              stillHeld: prod.stillHeld,
            });
          }

          // Picks received: resolve to the drafted player, then credit their rookie-year-on
          // production. If the pick was flipped again before the draft, the points belong to
          // whoever finally used it, this side just gets the branch trail.
          for (const p of picks) {
            if (p.owner_id !== rosterId) continue;
            const resolved = resolvePick(seasons, s, p.season, p.round, p.roster_id, allPlayers);
            const pickKey = `${p.season}|${p.round}|${s.ownerByRoster.get(p.roster_id) ?? p.roster_id}`;
            const onwardFlips = pickMoves.filter(m => m.key === pickKey && m.created > tx.created);

            let prod = { totalPoints: 0, starterPoints: 0, gamesRostered: 0, gamesStarted: 0, weekly: [] as WeeklyPoints[], stillHeld: true };
            let journey: JourneyEvent[] = [];
            let fate = resolved.status === 'pending' ? 'Draft hasn’t happened yet' : 'Pick untraceable';

            if (onwardFlips.length > 0) {
              journey = onwardFlips.slice(0, 8).map(m => ({
                kind: 'traded' as const,
                season: m.season,
                week: m.week,
                isOffseason: m.isOffseason,
                fromTeam: m.fromTeam,
                toTeam: m.toTeam,
                tradeId: m.tradeId,
              }));
              const last = onwardFlips[onwardFlips.length - 1];
              fate = `Traded to ${last.toTeam ?? '?'} before the draft`;
            } else if (resolved.status === 'resolved' && resolved.playerId && resolved.drafterOwnerId !== undefined && resolved.draftSeasonIdx !== undefined) {
              prod = accumulateProduction(seasons, resolved.draftSeasonIdx, 1, resolved.drafterOwnerId, resolved.playerId);
              journey = traceJourney(txIndex, resolved.playerId, 0).filter(e => e.season >= resolved.season);
              const drafterRoster = seasons[resolved.draftSeasonIdx].rosterByOwner.get(resolved.drafterOwnerId);
              const drafterTeam = drafterRoster !== undefined
                ? seasons[resolved.draftSeasonIdx].teamNameByRoster.get(drafterRoster) ?? teamName
                : teamName;
              fate = describeFate(journey, prod.stillHeld, drafterTeam, latest, resolved.playerId);
            }

            assets.push({
              kind: 'pick',
              player: onwardFlips.length > 0 ? null : resolved.became,
              pick: { season: resolved.season, round: resolved.round, status: resolved.status, became: resolved.became, pickNo: resolved.pickNo },
              totalPoints: prod.totalPoints,
              starterPoints: prod.starterPoints,
              gamesRostered: prod.gamesRostered,
              gamesStarted: prod.gamesStarted,
              weekly: prod.weekly,
              journey,
              fate,
              stillHeld: onwardFlips.length === 0 && prod.stillHeld,
            });
          }

          return {
            rosterId,
            userId: ownerId,
            teamName,
            avatar: s.avatarByRoster.get(rosterId) ?? '',
            assets,
            totalPoints: Math.round(assets.reduce((sum, a) => sum + a.totalPoints, 0) * 10) / 10,
          };
        }).filter(side => side.assets.length > 0);

        if (sides.length < 2) continue;

        const scoredWeeksSince = seasons
          .slice(seasonIdx)
          .reduce((n, sd, i) => n + Math.max(0, sd.lastScoredWeek - (i === 0 ? startWeek - 1 : 0)), 0);

        trades.push({
          transactionId: tx.transaction_id,
          created: tx.created,
          week: tradeWeek,
          season: s.season,
          isOffseason: s.isOffseason,
          sides,
          outcome: computeOutcome(sides, scoredWeeksSince, seasonLive, liveSeason),
        });
      }
    });

    trades.sort((a, b) => b.created - a.created);
    const seasonList = [...new Set(trades.map(t => t.season))].sort((a, b) => Number(b) - Number(a));

    const payload: TradeTreeResponse = { trades, seasons: seasonList };
    responseCache = { data: payload, ts: Date.now() };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[api/trade-tree]', err);
    return NextResponse.json({ error: 'Failed to build trade tree' }, { status: 500 });
  }
}
