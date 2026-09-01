import { NextResponse } from 'next/server';
import { deletePost, getPosts } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  return request.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

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

/**
 * Admin-only: take a post back off the feed.
 *
 * Publishing was immediate and irreversible, so a piece that came out wrong
 * stayed up until it aged past the retention cap. `deletePost` had been in the
 * store the whole time with nothing calling it.
 */
export async function DELETE(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    // The store decides whether the post existed. Checking against `getPosts`
    // first meant a queued post could not be deleted at all: that read filters
    // to what is already due, so anything the scheduler had staggered into the
    // future answered "no post with that id" and stayed there until it
    // published, which is exactly when you no longer want it.
    if (!await deletePost(id)) {
      return NextResponse.json({ error: 'No post with that id' }, { status: 404 });
    }
    return NextResponse.json({ deleted: id });
  } catch (err) {
    console.error('[api/ai/posts] delete', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
