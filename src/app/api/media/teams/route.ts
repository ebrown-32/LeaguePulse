import { NextResponse } from 'next/server';
import { getFantasyTeams } from '@/lib/mediaSources';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const teams = await getFantasyTeams();
    // Roster names are only needed server-side for filtering; the picker just needs identity.
    const publicTeams = teams.map(({ userId, teamName, avatar }) => ({ userId, teamName, avatar }));
    return NextResponse.json({ teams: publicTeams });
  } catch (error) {
    console.error('[api/media/teams]', error);
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
  }
}
