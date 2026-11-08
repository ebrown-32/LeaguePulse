/**
 * The league's trophy design (lib/trophyStyle), set in the admin panel's Trophy tab.
 *
 *   GET          public   { style }   the saved design, or the default
 *   PUT (admin)           { style }   saves it; anything unknown is put back to the default
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { readJson, writeJson } from '@/lib/jsonStore';
import { cleanTrophyStyle, DEFAULT_TROPHY } from '@/lib/trophyStyle';

export const dynamic = 'force-dynamic';

const KEY = 'lp_trophy_style', FILE = 'trophy-style.json';

export async function GET() {
  const style = cleanTrophyStyle(await readJson(KEY, FILE, DEFAULT_TROPHY));
  return NextResponse.json({ style }, { headers: { 'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=600' } });
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { style?: unknown } | null;
  const style = cleanTrophyStyle(body?.style);
  try {
    await writeJson(KEY, FILE, style);
    return NextResponse.json({ style });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save.' }, { status: 500 });
  }
}
