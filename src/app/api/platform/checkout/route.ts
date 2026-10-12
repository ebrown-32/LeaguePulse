/**
 * Start a league's subscription: hold its address and send the buyer to
 * Stripe Checkout.
 *
 * The site itself is created by the webhook when Stripe confirms, never here:
 * a checkout that is abandoned must not leave a half-made league behind, and
 * Stripe's confirmation is the one thing that cannot be faked from a browser.
 */

import { NextResponse } from 'next/server';
import { PLANS, PLATFORM, slugify } from '@/lib/platform/config';
import { slugAvailability, holdSlug, tenantForLeague } from '@/lib/platform/tenants';
import { stripe, billingReady } from '@/lib/platform/stripe';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { ok: allowed } = await rateLimit('lp_checkout_rl_', clientIp(req), 20, 60 * 60 * 1000);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again in a bit.' }, { status: 429 });

  let body: { leagueId?: string; slug?: string; plan?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  const leagueId = String(body.leagueId ?? '');
  const slug = slugify(String(body.slug ?? ''));
  const plan = body.plan === 'monthly' ? 'monthly' : 'season';
  if (!/^\d{15,22}$/.test(leagueId)) return NextResponse.json({ error: 'Pick a league first' }, { status: 400 });

  // The league has to be real, and an NFL league.
  const league = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`).then(r => r.json()).catch(() => null);
  if (!league?.league_id || (league.sport && league.sport !== 'nfl')) {
    return NextResponse.json({ error: 'That Sleeper league could not be found' }, { status: 404 });
  }

  try {
    const existing = await tenantForLeague(leagueId);
    if (existing && existing.status !== 'canceled') {
      return NextResponse.json({ error: `This league already has a site at ${existing.slug}.${PLATFORM.rootDomain}` }, { status: 409 });
    }
    const avail = await slugAvailability(slug, leagueId);
    if (!avail.ok) return NextResponse.json({ error: 'That address is not available' }, { status: 409 });

    const ready = billingReady();
    const s = stripe();
    if (!ready.ok || !s) {
      return NextResponse.json({
        error: 'Billing is not switched on for this deployment yet.',
        missing: ready.ok ? [] : ready.missing,
      }, { status: 503 });
    }

    await holdSlug(slug, leagueId);
    const origin = new URL(req.url).origin;
    const metadata = { leagueId, slug, plan, leagueName: String(league.name ?? '').slice(0, 200) };
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price: plan === 'monthly' ? PLANS.pro.stripeMonthly : PLANS.pro.stripeSeason,
        quantity: 1,
      }],
      // A trial with no card up front; if none is added by the end it cancels
      // quietly rather than sending an invoice nobody expected.
      payment_method_collection: 'if_required',
      subscription_data: {
        trial_period_days: PLANS.pro.trialDays,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        metadata,
      },
      metadata,
      customer_email: body.email?.includes('@') ? body.email : undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/start/done?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/start?league=${leagueId}&slug=${slug}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[api/platform/checkout]', err);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
