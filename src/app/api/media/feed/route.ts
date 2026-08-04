import { NextResponse } from 'next/server';
import { getUnifiedFeed, getFantasyTeams } from '@/lib/mediaSources';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 40);
  const teamId = searchParams.get('team');

  try {
    const team = teamId ? (await getFantasyTeams()).find(t => t.userId === teamId) : undefined;
    const { items, hasMore } = await getUnifiedFeed(offset, limit, team);
    return NextResponse.json({ feed: items, hasMore });
  } catch (error) {
    console.error('[api/media/feed]', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
