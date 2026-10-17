/**
 * The setup guide's status (lib/setupStatus), and changing it: hiding the
 * guide, marking the link shared, ticking a step off by hand. Admins only.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { markSetup, setupStatus, STEP_IDS, type SetupChange } from '@/lib/setupStatus';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  return NextResponse.json(await setupStatus(), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return deny();
  const body = await req.json().catch(() => ({}));
  let change: SetupChange;
  if (body.action === 'dismissed' || body.action === 'shared' || body.action === 'reopened') change = { action: body.action };
  else if (body.action === 'mark' && STEP_IDS.includes(body.step) && typeof body.done === 'boolean') change = { action: 'mark', step: body.step, done: body.done };
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  await markSetup(change);
  return NextResponse.json(await setupStatus());
}
