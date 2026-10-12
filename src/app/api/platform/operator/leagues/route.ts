/**
 * Operator only: every league on the platform, newest first, with its status,
 * so you can see sign-ups, trials and cancellations without opening Redis.
 *
 *   curl https://<root>/api/platform/operator/leagues \
 *     -H "Authorization: Bearer $LP_OPERATOR_SECRET"
 */

import { NextResponse } from 'next/server';
import { isOperatorRequest } from '@/lib/platform/operator';
import { listTenants } from '@/lib/platform/tenants';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isOperatorRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const leagues = (await listTenants()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = (s: string) => leagues.filter(t => t.status === s).length;
  return NextResponse.json({
    totals: { all: leagues.length, trialing: count('trialing'), active: count('active'), past_due: count('past_due'), canceled: count('canceled') },
    leagues: leagues.map(t => ({
      url: `https://${t.slug}.${PLATFORM.rootDomain}`,
      name: t.leagueName, status: t.status, plan: t.plan, owner: t.ownerEmail,
      stripeCustomer: t.stripeCustomerId, created: t.createdAt, updated: t.updatedAt,
    })),
  });
}
