/**
 * A franchise's logo. Versioned URLs (?v=) are cached for good: a new upload is a new version.
 *
 * A franchise that hasn't uploaded one wears its team's picture from the league
 * (Sleeper's team avatar, or ESPN's logo), sent on through a same-origin URL so
 * the stadium can paint it on the field (see Gridiron).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The hosts Next's image route will fetch (next.config.js images.remotePatterns). */
const IMAGE_HOSTS = new Set(['sleepercdn.com', 'a.espncdn.com', 's.espncdn.com', 'g.espncdn.com']);

async function archivePicture(franchiseId: string): Promise<string | null> {
  const [{ currentSite }, { listFranchises }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/archive/franchises')]);
  const list = await listFranchises(await currentSite()).catch(() => null);
  return list?.find(f => f.franchiseId === franchiseId)?.avatar ?? null;
}

/**
 * The team's league picture: a same-origin path to send the browser on to, or
 * the address of an SVG (ESPN's stock logo art), which Next's image route won't
 * take and this route serves itself.
 */
async function leaguePicture(franchiseId: string): Promise<{ path: string } | { svg: string } | null> {
  const [{ getCurrentLeagueId }, { getLeagueUsers }, { teamAvatar }] = await Promise.all([
    import('@/config/league'), import('@/lib/api'), import('@/lib/teamAvatar'),
  ]);
  const users = await getLeagueUsers(await getCurrentLeagueId()).catch(() => [] as any[]);
  // This season's picture, else the latest the league's archive has for the franchise.
  const avatar = teamAvatar((users as any[]).find(u => String(u.user_id) === franchiseId)) || await archivePicture(franchiseId);
  if (!avatar) return null;
  if (avatar.startsWith('/')) return { path: avatar };
  const url = /^https?:\/\//.test(avatar) ? avatar : `https://sleepercdn.com/avatars/${avatar}`;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.has(u.hostname)) return null;
  if (u.pathname.toLowerCase().endsWith('.svg')) return { svg: u.toString() };
  return { path: `/_next/image?url=${encodeURIComponent(url)}&w=256&q=75` };
}

/** At most this much SVG is passed on. */
const SVG_MAX = 256 * 1024;

/** An SVG from an allowed host, served from here, locked down so it can only ever be a picture. */
async function svgResponse(url: string): Promise<Response | null> {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5_000), cache: 'force-cache' });
  if (!r.ok) return null;
  const body = await r.text();
  if (body.length > SVG_MAX || !/<svg[\s>]/i.test(body)) return null;
  return new Response(body, {
    headers: {
      'content-type': 'image/svg+xml',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=3600',
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const franchiseId = decodeURIComponent((await params).id);
  const [{ currentSite }, { getLogo }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/store')]);
  const dataUri = await getLogo(await currentSite(), franchiseId).catch(() => null);
  const m = dataUri ? /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUri) : null;
  if (!m) {
    const fallback = await leaguePicture(franchiseId).catch(() => null);
    if (fallback && 'path' in fallback) return new Response(null, { status: 302, headers: { location: fallback.path, 'cache-control': 'public, max-age=300' } });
    const svg = fallback && 'svg' in fallback ? await svgResponse(fallback.svg).catch(() => null) : null;
    return svg ?? NextResponse.json({ error: 'No logo' }, { status: 404 });
  }
  const versioned = new URL(req.url).searchParams.has('v');
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'content-type': m[1], 'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300' },
  });
}
