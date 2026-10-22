/**
 * Operator only: the feedback inbox (lib/ops/feedback).
 *
 *   GET                         every bug and idea, newest first
 *   PATCH  { id, status?, note? }   triage one: new, planned, done or wontfix, and a note
 *   DELETE { id }               remove one
 *
 * All take `Authorization: Bearer $LP_OPERATOR_SECRET`, or a signed-in operator account.
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';
import { deleteFeedback, listFeedback, updateFeedback } from '@/lib/ops/feedback';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

export async function GET(req: Request) {
  if (!(await isOperator(req))) return deny();
  return NextResponse.json({ items: await listFeedback() }, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(req: Request) {
  if (!(await isOperator(req))) return deny();
  const body = await req.json().catch(() => ({})) as { id?: string; status?: unknown; note?: unknown };
  if (!body.id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  const item = await updateFeedback(body.id, body);
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE(req: Request) {
  if (!(await isOperator(req))) return deny();
  const body = await req.json().catch(() => ({})) as { id?: string };
  if (!body.id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });
  await deleteFeedback(body.id);
  return NextResponse.json({ ok: true });
}
