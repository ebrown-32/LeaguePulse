import { NextResponse } from 'next/server';
import { getLeagueRosters, getLeagueUsers } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';

export const dynamic = 'force-dynamic';

/**
 * The league half of the search index: every team and the manager behind it.
 *
 * Kept tiny and cached, because the palette fetches it the first time someone
 * opens search and then matches locally. A round trip per keystroke would be
 * slower than filtering a few dozen rows in the browser.
 */
export async function GET() {
  try {
    const leagueId = await getCurrentLeagueId();
    const [rosters, users] = await Promise.all([
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId),
    ]);

    const userById = new Map(users.map(u => [u.user_id, u]));
    const entries = (rosters as any[])
      .map(r => {
        const u: any = userById.get(r.owner_id);
        if (!u) return null;
        const teamName = u.metadata?.team_name || u.display_name || `Roster ${r.roster_id}`;
        return {
          id: `team-${r.roster_id}`,
          label: teamName,
          sub: `Managed by ${u.display_name ?? 'unknown'}`,
          href: `/team/${u.user_id}`,
          group: 'Teams',
          // So searching a manager's handle finds their team, and vice versa.
          keywords: `${u.display_name ?? ''} ${teamName}`,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { entries },
      { headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' } },
    );
  } catch (err) {
    console.error('[api/search-index]', err);
    return NextResponse.json({ entries: [] });
  }
}
