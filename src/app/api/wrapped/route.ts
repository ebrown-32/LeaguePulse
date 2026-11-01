/**
 * League Wrapped for this site's league (lib/wrapped): every manager's story and the league's,
 * for one season (`?season=2025`) or all of them (`?season=all`, the default once a league has
 * more than one season). With the seasons that can be wrapped, for the picker.
 *
 * Public, like the rest of a league's site, and the same for every visitor.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const [{ currentSite }, { wrappedFor, wrappableSeasons }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/wrapped/load')]);
  try {
    const site = await currentSite();
    const seasons = await wrappableSeasons(site);
    if (!seasons.length) return NextResponse.json({ seasons: [], wrapped: null });
    const asked = new URL(req.url).searchParams.get('season');
    // Unasked: the latest finished season, or the one in progress if there's nothing else.
    const fallback = seasons.find(s => s.final)?.season ?? seasons[0].season;
    const season = asked === 'all' ? null : asked && seasons.some(s => String(s.season) === asked) ? Number(asked) : fallback;
    const wrapped = await wrappedFor(site, season);
    // The league's own writers, for their takes in the stories: names and faces only.
    const cast = await import('@/lib/ai/store').then(async ({ getPersonalities }) => {
      const { personaAvatarUrl } = await import('@/lib/ai/avatar');
      return (await getPersonalities()).filter(p => p.enabled && !p.hidden).slice(0, 12)
        .map(p => ({ id: p.id, name: p.name, handle: p.handle, avatar: personaAvatarUrl(p), type: p.type ?? 'media' }));
    }).catch(() => []);
    return NextResponse.json({ seasons, wrapped, cast }, { headers: { 'cache-control': 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600' } });
  } catch (err) {
    console.error('[api/wrapped]', err);
    return NextResponse.json({ error: 'Wrapped could not be put together right now.' }, { status: 502 });
  }
}
