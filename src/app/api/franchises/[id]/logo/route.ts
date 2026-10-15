/** A franchise's logo. Versioned URLs (?v=) are cached for good: a new upload is a new version. */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ currentSite }, { getLogo }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/store')]);
  const dataUri = await getLogo(await currentSite(), decodeURIComponent((await params).id)).catch(() => null);
  const m = dataUri ? /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUri) : null;
  if (!m) return NextResponse.json({ error: 'No logo' }, { status: 404 });
  const versioned = new URL(req.url).searchParams.has('v');
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'content-type': m[1], 'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300' },
  });
}
