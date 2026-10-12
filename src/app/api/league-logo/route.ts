/** The league's uploaded logo, as an image. See /api/admin/logo. */

import { getRedis } from '@/lib/redisClient';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const dataUri = await getRedis().client?.get('league_logo').catch(() => null);
  const m = dataUri ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUri) : null;
  if (!m) return new Response(null, { status: 404 });
  const versioned = new URL(req.url).searchParams.has('v');
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'content-type': m[1],
      // The URL carries a version, so a new upload is a new URL and this one
      // can be cached for good.
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    },
  });
}
