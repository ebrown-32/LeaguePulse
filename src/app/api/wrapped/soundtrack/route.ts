/**
 * League Wrapped's music for one story (lib/wrapped/soundtrack).
 *
 *   GET ?season=<year>|all   { url, mood } when the story has its own track; { url: null } when it
 *                            plays the synthesized loop. Asking for a finished season (or the
 *                            all-time story) that has no track yet starts one being written, after
 *                            the response: the next visit hears it.
 *
 * Public, like the story. A stranger can't spend more by asking: each story gets one track (the
 * all-time one, one every few months), only for seasons the league has played and finished.
 */

import { NextResponse, after } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const none = () => NextResponse.json({ url: null }, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get('season') ?? '';
  if (!/^(all|\d{4})$/.test(asked)) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  const { storedSoundtrack, canCompose, composeSoundtrack } = await import('@/lib/wrapped/soundtrack');
  const have = await storedSoundtrack(asked).catch(() => null);
  if (have && !have.stale) {
    return NextResponse.json({ url: have.url, mood: have.mood }, { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } });
  }
  if (!canCompose()) return have ? NextResponse.json({ url: have.url, mood: have.mood }) : none();

  const [{ currentSite }, { wrappedFor, wrappableSeasons }, { currentTenant, runAsTenant }] = await Promise.all([
    import('@/lib/archive/ingest'), import('@/lib/wrapped/load'), import('@/lib/tenant/context'),
  ]);
  const site = await currentSite();
  const seasons = await wrappableSeasons(site).catch(() => []);
  const scope = asked === 'all' ? null : Number(asked);
  // Only a season that's over, or all of them once there's a finished one.
  const ok = scope === null ? seasons.some(s => s.final) : seasons.some(s => s.season === scope && s.final);
  if (!ok) return have ? NextResponse.json({ url: have.url, mood: have.mood }) : none();

  const tenant = await currentTenant().catch(() => null);
  after(() => runAsTenant(tenant, async () => {
    const w = await wrappedFor(site, scope);
    if (w && (scope === null || !w.inProgress)) await composeSoundtrack(asked, w, site);
  }));
  return NextResponse.json({ url: have?.url ?? null, mood: have?.mood ?? null, composing: true }, { headers: { 'cache-control': 'no-store' } });
}
