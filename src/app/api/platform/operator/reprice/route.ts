/**
 * Operator only: move subscriptions still on an old price (lib/platform/config LEGACY_PRICES) to
 * the price sold today, same tier and billing cycle.
 *
 *   GET    the subscriptions that would move: league, plan, what they pay now and will pay, when
 *   POST   { ids?: string[] } moves them (every one listed by GET when ids is left out)
 *
 * No proration: nothing is charged or credited now, and the new price applies from each
 * subscription's next renewal. A league on a free trial simply starts on the new price.
 *
 * Takes `Authorization: Bearer $LP_OPERATOR_SECRET`, or a signed-in operator account.
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { isOperator } from '@/lib/platform/operator';
import { LEGACY_PRICES, stripePriceFor, tierPlan } from '@/lib/platform/config';
import { stripe } from '@/lib/platform/stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Still billing, or about to: the subscriptions worth moving. */
const LIVE = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due']);

interface Move {
  id: string; slug: string | null; tier: 'standard' | 'ai'; plan: 'monthly' | 'season';
  status: string; from: number | null; to: number; renews: string | null; endsInstead: boolean;
  item: string; target: string;
}

async function pending(s: Stripe): Promise<{ moves: Move[]; missing: string[] }> {
  const moves: Move[] = [];
  const missing = new Set<string>();
  for (const legacy of LEGACY_PRICES) {
    const target = stripePriceFor(legacy.tier, legacy.plan);
    for (const priceId of legacy.ids) {
      if (!target) { missing.add(`${legacy.tier} ${legacy.plan}`); continue; }
      for await (const sub of s.subscriptions.list({ price: priceId, status: 'all', limit: 100 })) {
        if (!LIVE.has(sub.status)) continue;
        const item = sub.items.data.find(i => i.price.id === priceId);
        if (!item) continue;
        const end = (item as { current_period_end?: number }).current_period_end
          ?? (sub as unknown as { current_period_end?: number }).current_period_end;
        const plan = tierPlan(legacy.tier);
        moves.push({
          id: sub.id, slug: sub.metadata?.slug ?? null, tier: legacy.tier, plan: legacy.plan, status: sub.status,
          from: item.price.unit_amount != null ? item.price.unit_amount / 100 : null,
          to: legacy.plan === 'monthly' ? plan.monthly : plan.season,
          renews: end ? new Date(end * 1000).toISOString() : null,
          endsInstead: sub.cancel_at_period_end,
          item: item.id, target,
        });
      }
    }
  }
  return { moves, missing: [...missing] };
}

export async function GET(req: Request) {
  if (!(await isOperator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = stripe();
  const configured = LEGACY_PRICES.some(l => l.ids.length);
  if (!s || !configured) return NextResponse.json({ configured, moves: [], missing: [] });
  try {
    const { moves, missing } = await pending(s);
    return NextResponse.json({ configured, moves: moves.map(({ item: _i, target: _t, ...m }) => m), missing });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stripe could not be read' }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!(await isOperator(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = stripe();
  if (!s) return NextResponse.json({ error: 'Billing is not switched on' }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { ids?: unknown };
  const only = Array.isArray(body.ids) ? new Set(body.ids.filter((x): x is string => typeof x === 'string')) : null;

  const { moves } = await pending(s);
  const results: { id: string; slug: string | null; ok: boolean; error?: string }[] = [];
  for (const m of moves.filter(m => !only || only.has(m.id))) {
    try {
      await s.subscriptions.update(m.id, {
        items: [{ id: m.item, price: m.target }],
        // Nothing charged or credited now: the new price starts at the next renewal.
        proration_behavior: 'none',
      }, { idempotencyKey: `reprice-${m.id}-${m.target}` });
      results.push({ id: m.id, slug: m.slug, ok: true });
    } catch (err) {
      results.push({ id: m.id, slug: m.slug, ok: false, error: err instanceof Error ? err.message : 'Failed' });
    }
  }
  return NextResponse.json({ moved: results.filter(r => r.ok).length, results });
}
