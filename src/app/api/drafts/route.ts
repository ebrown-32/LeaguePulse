import { NextResponse } from 'next/server';
import { getAllLinkedLeagueIds } from '@/lib/api';

export const dynamic = 'force-dynamic';

const BASE = 'https://api.sleeper.app/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DraftPickEnriched {
  pickNo: number;
  round: number;
  slot: number;
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  isKeeper: boolean;
}

export interface DraftTeamSlot {
  slot: number;
  rosterId: number;
  userId: string;
  teamName: string;
  avatar: string;
  picks: DraftPickEnriched[];
}

// Represents a draft pick that has been traded before the draft happens.
// Carries enough info to build an ownership board for upcoming drafts.
export interface TradedFuturePick {
  round: number;
  // The slot/team that originally owned this pick position
  fromSlot: number;
  fromRosterId: number;
  fromTeamName: string;
  fromAvatar: string;
  // The slot/team that currently holds this pick
  toSlot: number;
  toRosterId: number;
  toTeamName: string;
  toAvatar: string;
}

export interface EnrichedDraft {
  draftId: string;
  leagueId: string;
  season: string;
  type: string;
  status: string;
  rounds: number;
  teams: number;
  startTime: number | null;
  lastPickedAt: number | null;
  orderSet: boolean;  // false when commissioner hasn't randomized the draft order yet
  slots: DraftTeamSlot[];
  picks: DraftPickEnriched[];
  // Only populated for pre_draft / drafting status
  tradedFuturePicks: TradedFuturePick[];
}

export interface DraftsResponse {
  drafts: EnrichedDraft[];
  seasons: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSlots(rawDraft: any, rosters: any[], users: any[]): { slots: DraftTeamSlot[]; orderSet: boolean } {
  const userById   = new Map<string, any>(users.map(u => [u.user_id, u]));
  const rosterById = new Map<number, any>(rosters.map(r => [r.roster_id, r]));
  const numTeams   = rawDraft.settings?.teams ?? rosters.length;

  const slotToRosterId: Record<string, number> = rawDraft.slot_to_roster_id ?? {};
  const draftOrder: Record<string, number>      = rawDraft.draft_order ?? {};
  const orderSet = Object.keys(slotToRosterId).length > 0 || Object.keys(draftOrder).length > 0;

  const slotToUserId = new Map<number, string>(
    Object.entries(draftOrder).map(([uid, slot]) => [Number(slot), uid])
  );

  const slots: DraftTeamSlot[] = [];

  if (!orderSet) {
    // Draft order not yet set — assign rosters to slots in roster_id order so teams
    // at least appear on the board rather than showing "Team 1…N" placeholders.
    const sortedRosters = [...rosters].sort((a, b) => a.roster_id - b.roster_id).slice(0, numTeams);
    for (let i = 0; i < sortedRosters.length; i++) {
      const roster = sortedRosters[i];
      const user   = userById.get(roster.owner_id);
      slots.push({
        slot:     i + 1,
        rosterId: roster.roster_id,
        userId:   user?.user_id ?? '',
        teamName: user?.metadata?.team_name || user?.display_name || `Team ${i + 1}`,
        avatar:   user?.avatar ?? '',
        picks:    [],
      });
    }
    return { slots, orderSet };
  }

  for (let slot = 1; slot <= numTeams; slot++) {
    let roster: any = undefined;
    let user:   any = undefined;

    const rid = slotToRosterId[String(slot)];
    if (rid) {
      roster = rosterById.get(rid);
      user   = roster ? userById.get(roster.owner_id) : undefined;
    }

    if (!user) {
      const uid = slotToUserId.get(slot);
      if (uid) {
        user   = userById.get(uid);
        roster = rosters.find(r => r.owner_id === uid);
      }
    }

    slots.push({
      slot,
      rosterId: roster?.roster_id ?? 0,
      userId:   user?.user_id ?? '',
      teamName: user?.metadata?.team_name || user?.display_name || `Team ${slot}`,
      avatar:   user?.avatar ?? '',
      picks:    [],
    });
  }

  return { slots, orderSet };
}

function enrichTradedFuturePicks(
  rawTradedPicks: any[],
  season: string,
  slots: DraftTeamSlot[],
): TradedFuturePick[] {
  const slotByRosterId = new Map(slots.map(s => [s.rosterId, s]));

  // Sleeper returns the full transaction history — one entry per trade, not per pick.
  // Group by (round, owner_id): owner_id is always the ORIGINAL roster (the draft slot position),
  // preserved across re-trades.
  const groups = new Map<string, any[]>();
  for (const p of (rawTradedPicks ?? [])) {
    if (p.season !== season) continue;
    const key = `${p.round}-${p.owner_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const result: TradedFuturePick[] = [];

  for (const entries of groups.values()) {
    // Walk the chain to find the final holder.
    // The final entry is the one whose roster_id hasn't been traded away again
    // (i.e., it doesn't appear as a previous_owner_id in any sibling entry).
    const previousOwners = new Set(entries.map((e: any) => e.previous_owner_id));
    const finalEntry: any =
      entries.find((e: any) => !previousOwners.has(e.roster_id)) ??
      entries[entries.length - 1];

    const fromSlotObj = slotByRosterId.get(finalEntry.owner_id);
    const toSlotObj   = slotByRosterId.get(finalEntry.roster_id);

    // Skip if slot unknown, or pick returned to original owner
    if (!fromSlotObj || !toSlotObj || fromSlotObj.slot === toSlotObj.slot) continue;

    result.push({
      round:        finalEntry.round,
      fromSlot:     fromSlotObj.slot,
      fromRosterId: fromSlotObj.rosterId,
      fromTeamName: fromSlotObj.teamName,
      fromAvatar:   fromSlotObj.avatar,
      toSlot:       toSlotObj.slot,
      toRosterId:   toSlotObj.rosterId,
      toTeamName:   toSlotObj.teamName,
      toAvatar:     toSlotObj.avatar,
    });
  }

  return result;
}

async function enrichDraft(
  rawDraft: any,
  rawPicks: any[],
  rawTradedPicks: any[],
  rosters: any[],
  users: any[],
): Promise<EnrichedDraft> {
  const userById   = new Map<string, any>(users.map(u => [u.user_id, u]));
  const rosterById = new Map<number, any>(rosters.map(r => [r.roster_id, r]));
  const { slots, orderSet } = buildSlots(rawDraft, rosters, users);
  const slotByUserId   = new Map(slots.map(s => [s.userId, s]));
  const slotByRosterId = new Map(slots.map(s => [s.rosterId, s]));

  const picks: DraftPickEnriched[] = rawPicks
    .map((p: any) => {
      const roster  = rosterById.get(p.roster_id);
      const user    = userById.get(p.picked_by) ?? (roster ? userById.get(roster.owner_id) : undefined);
      const slotObj = slotByUserId.get(p.picked_by) ?? slotByRosterId.get(p.roster_id);

      return {
        pickNo:     p.pick_no,
        round:      p.round,
        slot:       p.draft_slot,
        rosterId:   p.roster_id,
        userId:     p.picked_by ?? '',
        teamName:   user?.metadata?.team_name || user?.display_name || slotObj?.teamName || 'Team',
        avatar:     user?.avatar ?? slotObj?.avatar ?? '',
        playerId:   p.player_id ?? '',
        playerName: p.metadata
          ? `${p.metadata.first_name ?? ''} ${p.metadata.last_name ?? ''}`.trim()
          : `Player ${p.player_id}`,
        position: p.metadata?.position ?? '?',
        nflTeam:  p.metadata?.team ?? 'FA',
        isKeeper: Boolean(p.is_keeper),
      } satisfies DraftPickEnriched;
    })
    .sort((a, b) => a.pickNo - b.pickNo);

  for (const pick of picks) {
    const slotObj = slotByUserId.get(pick.userId) ?? slotByRosterId.get(pick.rosterId);
    if (slotObj) slotObj.picks.push(pick);
  }

  const timestamps  = rawPicks.map((p: any) => p.picked_at ?? 0).filter(Boolean);
  const lastPickedAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

  const isPreDraft = rawDraft.status === 'pre_draft' || rawDraft.status === 'drafting';
  const tradedFuturePicks = isPreDraft
    ? enrichTradedFuturePicks(rawTradedPicks, rawDraft.season, slots)
    : [];

  return {
    draftId:      rawDraft.draft_id,
    leagueId:     rawDraft.league_id,
    season:       rawDraft.season,
    type:         rawDraft.type ?? 'snake',
    status:       rawDraft.status,
    rounds:       rawDraft.settings?.rounds ?? 15,
    teams:        rawDraft.settings?.teams  ?? rosters.length,
    startTime:    rawDraft.start_time ?? null,
    lastPickedAt,
    orderSet,
    slots,
    picks,
    tradedFuturePicks,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const initialId = process.env.NEXT_PUBLIC_LEAGUE_ID;
  if (!initialId) return NextResponse.json({ error: 'No league configured' }, { status: 400 });

  try {
    const allLeagueIds = await getAllLinkedLeagueIds(initialId);

    const allDrafts: EnrichedDraft[] = [];

    await Promise.all(allLeagueIds.map(async leagueId => {
      const [draftsRaw, rosters, users, tradedPicksRaw] = await Promise.all([
        fetch(`${BASE}/league/${leagueId}/drafts`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/league/${leagueId}/rosters`, { next: { revalidate: 3600 } })
          .then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/league/${leagueId}/users`, { next: { revalidate: 3600 } })
          .then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/league/${leagueId}/traded_picks`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      for (const rawDraft of (draftsRaw ?? [])) {
        const isActive    = rawDraft.status === 'drafting' || rawDraft.status === 'pre_draft';
        const picksOpts: RequestInit = isActive ? { cache: 'no-store' } : { next: { revalidate: 86400 } };

        const picks = await fetch(`${BASE}/draft/${rawDraft.draft_id}/picks`, picksOpts)
          .then(r => r.ok ? r.json() : [])
          .catch(() => []);

        const enriched = await enrichDraft(rawDraft, picks ?? [], tradedPicksRaw ?? [], rosters, users);
        allDrafts.push(enriched);
      }
    }));

    allDrafts.sort((a, b) =>
      Number(b.season) - Number(a.season) ||
      (b.startTime ?? 0) - (a.startTime ?? 0)
    );

    const seasons = [...new Set(allDrafts.map(d => d.season))].sort((a, b) => Number(b) - Number(a));

    return NextResponse.json({ drafts: allDrafts, seasons } satisfies DraftsResponse);
  } catch (err) {
    console.error('[api/drafts]', err);
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 });
  }
}
