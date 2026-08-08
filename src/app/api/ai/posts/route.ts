import { NextResponse } from 'next/server';
import { getPosts } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';

/** Public, read-only. The feed is written by the scheduler and the admin
 *  back office — never by a visitor. */
export async function GET(request: Request) {
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 40, 100);
  try {
    return NextResponse.json({ posts: await getPosts(limit) });
  } catch (err) {
    console.error('[api/ai/posts]', err);
    return NextResponse.json({ error: 'Failed to load feed' }, { status: 500 });
  }
}
