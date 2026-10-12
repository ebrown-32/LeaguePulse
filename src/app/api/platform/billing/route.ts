/**
 * A league's subscription, for its own admin.
 *
 * GET: the plan and status, so the admin page can show them.
 * POST: a link into Stripe's customer portal, where the owner updates the
 * card, switches plan, downloads invoices or cancels. Stripe hosts all of it;
 * a cancellation comes back through the webhook like any other change.
 *
 * Self-hosted copies have no subscription, and both answer 404.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { currentTenant } from '@/lib/tenant/context';
import { stripe } from '@/lib/platform/stripe';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tenant = await currentTenant();
  if (!tenant) return NextResponse.json({ hosted: false }, { status: 404 });
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    hosted: true,
    status: tenant.status,
    plan: tenant.plan,
    canManage: Boolean(tenant.stripeCustomerId && stripe()),
    supportEmail: PLATFORM.supportEmail || null,
  });
}

export async function POST(req: Request) {
  const tenant = await currentTenant();
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = stripe();
  if (!s || !tenant.stripeCustomerId) {
    return NextResponse.json({ error: 'Billing is not available for this league. Contact support.' }, { status: 409 });
  }
  try {
    const portal = await s.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `https://${tenant.slug}.${PLATFORM.rootDomain}/admin`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error('[platform/billing]', err);
    return NextResponse.json({ error: 'Could not open billing. Try again, or contact support.' }, { status: 502 });
  }
}
