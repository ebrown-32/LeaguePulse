/**
 * How much the league's media desk writes (lib/ai/deskVolume).
 *
 *   GET            the current choice, and what each means
 *   PUT { volume } the league admin's choice
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { DESK_VOLUME_INFO, DESK_VOLUMES, getDeskVolume, setDeskVolume } from '@/lib/ai/deskVolume';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ volume: await getDeskVolume(), options: DESK_VOLUMES.map(id => ({ id, ...DESK_VOLUME_INFO[id] })) });
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ volume: await setDeskVolume(body?.volume) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not save' }, { status: 400 });
  }
}
