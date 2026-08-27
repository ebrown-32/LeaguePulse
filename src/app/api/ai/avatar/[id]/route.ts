import { NextRequest, NextResponse } from 'next/server';
import { getPersonalities } from '@/lib/ai/store';
import { avatarProblem, decodeAvatar } from '@/lib/ai/avatarUpload';

export const dynamic = 'force-dynamic';

/**
 * Serve a persona's uploaded portrait.
 *
 * Public by design: these appear on the feed, the home carousel and /desk, the
 * same as the DiceBear faces they replace. Nothing here is derived from the
 * request beyond the persona id, which is only ever used to look up a record
 * that an authenticated admin already wrote.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const persona = (await getPersonalities()).find(p => p.id === id);
  if (!persona?.avatarImage) {
    return NextResponse.json({ error: 'No uploaded portrait' }, { status: 404 });
  }

  // Re-validate on read. The record could predate the current rules, or have
  // been written by an older build, and this response is served from our own
  // origin: an unchecked value here would be an open redirect for content type.
  if (avatarProblem(persona.avatarImage)) {
    return NextResponse.json({ error: 'Stored portrait is invalid' }, { status: 415 });
  }
  const decoded = decodeAvatar(persona.avatarImage);
  if (!decoded) {
    return NextResponse.json({ error: 'Stored portrait is invalid' }, { status: 415 });
  }

  return new Response(new Uint8Array(decoded.bytes), {
    headers: {
      'Content-Type': decoded.mediaType,
      // The caller appends ?v=<hash of the bytes>, so a given URL can never
      // describe different images and is safe to cache hard. Changing the
      // portrait changes the hash and therefore the URL.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
