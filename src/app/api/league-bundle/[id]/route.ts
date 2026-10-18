/**
 * A finished season of this site's league, in one response. See src/lib/bundles.
 *
 * Only seasons of the site's own league (its linked seasons) are served:
 * building one asks the source about forty-five questions, and this must not
 * become a way to make the site ask them about any league at all. A season
 * that is still live answers 404, and the page reads it live as before.
 */

import { NextResponse } from 'next/server';
import { getLinkedLeagueIds } from '@/config/league';
import { getBundle } from '@/lib/bundles/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await getLinkedLeagueIds().catch(() => [] as string[]);
  if (!own.includes(id)) return NextResponse.json({ error: 'Not this site’s league' }, { status: 404 });
  // The demo league's seasons are played out here, not stored (src/lib/demo).
  const bundle = id.startsWith('demo-')
    ? await (await import('@/lib/demo/data')).demoBundle(id).catch(() => null)
    : await getBundle(id);
  if (!bundle) return NextResponse.json({ live: true }, { status: 404, headers: { 'cache-control': 'no-store' } });
  return NextResponse.json(bundle, {
    // A finished season does not change. The URL carries the bundle format's
    // version, so a new format is a new URL.
    headers: { 'cache-control': 'public, max-age=3600, s-maxage=604800' },
  });
}
