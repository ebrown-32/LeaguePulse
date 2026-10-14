/**
 * Operator only: issue a one-time admin recovery link for a league.
 *
 *   curl -X POST https://<root>/api/platform/recover \
 *     -H "Authorization: Bearer $LP_OPERATOR_SECRET" -d '{"slug":"theleague"}'
 *
 * Check who is asking before sending the link on: the email on the league's
 * Stripe customer is the record of who paid for it.
 */

import { NextResponse } from 'next/server';
import { isOperator } from '@/lib/platform/operator';
import { getTenant } from '@/lib/platform/tenants';
import { issueRecoveryLink } from '@/lib/platform/recovery';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await isOperator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const slug = String((await req.json().catch(() => ({})))?.slug ?? '').toLowerCase();
  const tenant = slug ? await getTenant(slug) : null;
  if (!tenant) return NextResponse.json({ error: 'No such league' }, { status: 404 });
  const link = await issueRecoveryLink(slug);
  return NextResponse.json({ ...link, slug, ownerEmail: tenant.ownerEmail });
}
