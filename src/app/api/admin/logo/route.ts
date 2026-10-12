/**
 * Upload or remove the league's logo.
 *
 * The image is kept in storage under its own key, not inside the theme: the
 * theme is read on every page render, and carrying a few hundred kilobytes of
 * image in it would put that weight into every request. The theme instead
 * points at /api/league-logo with a version, so browsers cache the image hard
 * and a new upload still shows straight away.
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { isAdminRequest } from '@/lib/tenant/admin';
import { getRedis } from '@/lib/redisClient';
import { saveTheme } from '@/lib/themeStorage';

export const dynamic = 'force-dynamic';

const LOGO_KEY = 'league_logo';
const MAX_BYTES = 256 * 1024;
const DATA_URI = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/;

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = getRedis().client;
  if (!r) return NextResponse.json({ error: 'Uploads need storage (Redis) configured.' }, { status: 503 });

  let dataUri = '';
  try { dataUri = String((await req.json())?.dataUri ?? ''); } catch { /* checked below */ }
  const m = DATA_URI.exec(dataUri);
  if (!m) return NextResponse.json({ error: 'Upload a WebP, PNG or JPEG image.' }, { status: 400 });
  if (Buffer.byteLength(m[2], 'base64') > MAX_BYTES) {
    return NextResponse.json({ error: `The logo must be under ${MAX_BYTES / 1024}KB.` }, { status: 400 });
  }

  await r.set(LOGO_KEY, dataUri);
  const version = createHash('sha1').update(dataUri).digest('hex').slice(0, 10);
  const logoUrl = `/api/league-logo?v=${version}`;
  await saveTheme({ logoUrl });
  return NextResponse.json({ logoUrl });
}

export async function DELETE(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await getRedis().client?.del(LOGO_KEY);
  await saveTheme({ logoUrl: null });
  return NextResponse.json({ logoUrl: null });
}
