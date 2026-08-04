import { NextResponse } from 'next/server';
import { getArticles, getFantasyTeams } from '@/lib/mediaSources';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 40, 200);
  const teamId = searchParams.get('team');

  try {
    const team = teamId ? (await getFantasyTeams()).find(t => t.userId === teamId) : undefined;
    const articles = await getArticles(limit, team);
    return NextResponse.json({ articles });
  } catch (error) {
    console.error('[api/media/articles]', error);
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 });
  }
}
