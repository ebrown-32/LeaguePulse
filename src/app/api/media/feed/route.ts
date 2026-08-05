import { NextResponse } from 'next/server';
import { getUnifiedFeed, getFantasyTeams, type FeedKind, type TrendType } from '@/lib/mediaSources';

export const dynamic = 'force-dynamic';

const VALID_KINDS: FeedKind[] = ['article', 'injury', 'trending'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 40);
  const teamId = searchParams.get('team');
  // Unrecognised values are dropped so a bad param can't silently empty the
  // feed; omitting `kinds` entirely still means "everything".
  const kinds = (searchParams.get('kinds') ?? '')
    .split(',')
    .filter((k): k is FeedKind => VALID_KINDS.includes(k as FeedKind));
  const trend: TrendType = searchParams.get('trend') === 'drop' ? 'drop' : 'add';

  try {
    const team = teamId ? (await getFantasyTeams()).find(t => t.userId === teamId) : undefined;
    const { items, hasMore } = await getUnifiedFeed(offset, limit, team, kinds, trend);
    return NextResponse.json({ feed: items, hasMore });
  } catch (error) {
    console.error('[api/media/feed]', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
