import { NextResponse } from 'next/server';
import { getSnapshot } from '@/lib/fantasyProsStore';
import { isFantasyProsConfigured } from '@/lib/fantasypros';
import { getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';

export const dynamic = 'force-dynamic';

/**
 * Public, read-only view of the cached FantasyPros snapshot.
 *
 * Never calls FantasyPros. It reads the snapshot the scheduled refresh wrote
 * and cross-references it against the league's rosters, which is the part that
 * makes a generic rankings table useful here: you can see at a glance which of
 * the top plays are already owned and by whom.
 */

/** FantasyPros and Sleeper spell names differently often enough that an exact
 *  match loses real players. Strip punctuation, suffixes, and case. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'`]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Owner {
  userId: string;
  teamName: string;
  avatar: string;
}

export async function GET() {
  if (!isFantasyProsConfigured()) {
    return NextResponse.json({ configured: false, snapshot: null });
  }

  const snapshot = await getSnapshot();
  if (!snapshot) {
    // Configured but never refreshed. Distinct from "not configured" so the UI
    // can tell the user which of the two problems they have.
    return NextResponse.json({ configured: true, snapshot: null });
  }

  let ownership: Record<string, Owner> = {};
  try {
    const leagueId = await getCurrentLeagueId();
    const [rosters, users, players] = await Promise.all([
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
      getPlayersDirectory(),
    ]);

    const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

    // Build name+position -> owner for every rostered player once, then look up
    // each ranked player. Position is part of the key because a name collision
    // across positions is far more likely than within one.
    for (const roster of rosters) {
      const u = userById.get(roster.owner_id);
      if (!u) continue;
      const owner: Owner = {
        userId: roster.owner_id,
        teamName: u?.metadata?.team_name || u?.display_name || 'Unknown',
        avatar: u?.avatar ?? '',
      };
      for (const pid of roster.players ?? []) {
        const p = players[pid];
        if (!p) continue;
        const name = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        if (!name || !p.position) continue;
        ownership[`${normalizeName(name)}|${p.position}`] = owner;
      }
    }
  } catch (err) {
    // Ownership is an enhancement. If the league lookup fails the rankings are
    // still worth showing, so degrade rather than fail the whole response.
    console.error('[fantasypros/rankings] ownership lookup failed:', err);
    ownership = {};
  }

  const boards = Object.fromEntries(
    Object.entries(snapshot.boards).map(([mode, byPosition]) => [
      mode,
      Object.fromEntries(
        Object.entries(byPosition ?? {}).map(([pos, board]) => [
          pos,
          board && {
            ...board,
            players: board.players.map(p => ({
              ...p,
              ownedBy: ownership[`${normalizeName(p.name)}|${p.position}`] ?? null,
            })),
          },
        ]),
      ),
    ]),
  );

  return NextResponse.json({ configured: true, snapshot: { ...snapshot, boards } });
}
