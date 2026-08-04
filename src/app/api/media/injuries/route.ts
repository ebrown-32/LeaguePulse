import { NextResponse } from 'next/server';
import { getInjuries, getFantasyTeams } from '@/lib/mediaSources';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team');

  try {
    const team = teamId ? (await getFantasyTeams()).find(t => t.userId === teamId) : undefined;
    const injuries = await getInjuries(team);
    return NextResponse.json({ injuries });
  } catch (error) {
    console.error('[api/media/injuries]', error);
    return NextResponse.json({ error: 'Failed to fetch injuries' }, { status: 500 });
  }
}
