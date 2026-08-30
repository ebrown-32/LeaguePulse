import { NextResponse } from 'next/server';
import { getLikes, likePost } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';

/**
 * Reader likes on feed posts.
 *
 * Deliberately open, unlike everything else under /api/ai: this is the one
 * endpoint league members are meant to reach. It spends nothing, writes only a
 * counter, and there is no sign in to gate it behind. The worst a bad actor
 * achieves is a wrong number on a fantasy football joke.
 */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
  return NextResponse.json({ likes: await getLikes(ids) });
}

export async function POST(request: Request) {
  try {
    const { id, liked } = await request.json() as { id?: string; liked?: boolean };
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const count = await likePost(id, liked === false ? -1 : 1);
    return NextResponse.json({ id, count });
  } catch (err) {
    console.error('[api/ai/likes]', err);
    return NextResponse.json({ error: 'Could not record that' }, { status: 500 });
  }
}
