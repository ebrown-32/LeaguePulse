/**
 * A team logo a manager uploaded to ESPN, for this site's ESPN league.
 *
 * ESPN's image service only answers signed-in browsers, so league-mates
 * without an ESPN login would see a broken image. The site fetches it with
 * the league's own cookies and passes the image on (never the cookies). Only
 * ESPN league image ids are accepted, so this cannot fetch anything else, and
 * only for an ESPN league that has given its cookies (a site, or a sign-up).
 *
 * The league is in the path rather than read from the site's address: Next's
 * image optimizer fetches this from inside the server, with no address.
 */

import { getEspnCredentials } from '@/lib/providers/espn/credentials';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ league: string; id: string }> }) {
  const { league: lid, id } = await params;
  if (!/^\d{1,12}$/.test(lid) || !/^[0-9a-f-]{8,64}$/i.test(id)) return new Response(null, { status: 404 });
  const creds = await getEspnCredentials(lid);
  if (!creds) return new Response(null, { status: 404 });
  const res = await fetch(`https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/${id}`, {
    headers: { cookie: `SWID=${creds.swid}; espn_s2=${creds.s2}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.startsWith('image/')) return new Response(null, { status: 404 });
  return new Response(res.body, {
    headers: {
      // ESPN serves JPEGs as "image/jpg", which browsers accept but is not the registered name.
      'content-type': type.replace('image/jpg', 'image/jpeg'),
      // An uploaded logo never changes under the same id.
      'cache-control': 'public, max-age=86400, s-maxage=2592000, immutable',
    },
  });
}
