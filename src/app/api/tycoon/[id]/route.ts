/**
 * A franchise's tycoon (src/lib/tycoon).
 *
 *   GET    the stadium, crowds and story for anyone; with the franchise's
 *          manager pass (x-manager-pass) or the league's admin
 *          (x-admin-password), the books too: VC, prices, every game's
 *          ledger, the shop
 *   POST { action: 'prices', prices } | { action: 'build', track }
 *        | { action: 'sponsor', offer, structure } | { action: 'sponsor-end', slot }
 *          the manager's moves, checked against the economy as it stands now.
 *          A sponsorship is signed from this week's offers (lib/tycoon/sponsors), which the
 *          server works out again: the terms recorded are its own, never the browser's.
 */

import { NextResponse, after } from 'next/server';
import type { TrackId } from '@/lib/tycoon/catalog';
import type { Announcement } from '@/lib/franchise/announce';

/** The franchise's official post about a move (lib/franchise/announce), after the answer goes out. */
function tell(franchiseId: string, a: Announcement) {
  after(async () => (await import('@/lib/franchise/announce')).announce(franchiseId, a));
}

export const dynamic = 'force-dynamic';

async function context(req: Request, rawId: string) {
  const [{ currentSite }, { verifyManagerPass }] = await Promise.all([import('@/lib/archive/ingest'), import('@/lib/franchise/managerPass')]);
  const site = await currentSite();
  const franchiseId = decodeURIComponent(rawId);
  const manager = await verifyManagerPass(req.headers.get('x-manager-pass'), site, franchiseId).catch(() => false);
  let admin = false;
  if (!manager && req.headers.get('x-admin-password')) admin = await (await import('@/lib/tenant/admin')).isAdminRequest(req);
  return { site, franchiseId, manager, admin };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await context(req, (await params).id);
  const [{ economyOf }, { franchiseValue, fairPrices, shop, PROMO_COOLDOWN, PROMO_MAX }, { facilityStats }] = await Promise.all([
    import('@/lib/tycoon/service'), import('@/lib/tycoon/economy'), import('@/lib/tycoon/catalog'),
  ]);
  const s = await economyOf(c.site, c.franchiseId).catch(err => { console.error('[api/tycoon]', err); return null; });
  if (!s) return NextResponse.json({ available: false });
  const stats = facilityStats(s.facilities);
  const open = c.manager || c.admin;
  const desk = open ? await sponsorDesk(c.franchiseId, s, Date.now()) : null;
  return NextResponse.json({
    available: true,
    canManage: c.manager,
    stadium: { ...stats, facilities: s.facilities },
    interest: Math.round(s.interest * 10) / 10,
    value: franchiseValue(s),
    // Crowds are public: everyone saw them. Money is not.
    games: s.games.map(g => ({ key: g.key, at: g.at, season: g.season, week: g.week, result: g.result, points: g.points, oppPoints: g.oppPoints, opponent: g.opponent, postseason: g.postseason, home: g.home, attendance: g.attendance, capacity: g.capacity, interest: g.interest, ...(open ? { prices: g.prices, fairTicket: g.fairTicket, revenue: g.revenue, costs: g.costs, profit: g.profit, interestChange: g.interestChange } : {}) })),
    story: s.story.filter(e => open || e.kind !== 'prices').slice(-40),
    // Who the franchise's partners are is public (their names are on the building); the money isn't.
    partners: s.deals.map(d => ({ slot: d.slot, brand: d.brand })),
    books: open ? {
      vc: s.vc, prices: s.prices, fair: fairPrices(s), autopilot: s.autopilot, form: s.form, resentment: s.resentment,
      days: s.days.filter((_, i) => i % 1 === 0).slice(-120), shop: shop(s),
      // Promotion night: the one booked for the next home game, and when the next can be.
      promo: { pending: s.promo ? { id: s.promo.id, score: s.promo.score } : null, nextAt: s.lastPromoAt ? s.lastPromoAt + PROMO_COOLDOWN : 0, max: PROMO_MAX },
      covered: Math.round(s.covered),
      sponsors: desk ? {
        slots: desk.slots, value: desk.sp.sponsorValue(desk.standing), tier: desk.sp.tierFor(desk.standing),
        loyalty: s.loyalty, past: s.pastDeals.slice(-12).reverse(), earned: Math.round(s.partnerEarned),
        // How the team has done lately, for what a deal is likely to pay: wins and sellouts over the last eight.
        form: (() => { const g = s.games.slice(-8), home = g.filter(x => x.home); return { winRate: g.length ? g.filter(x => x.result === 'W').length / g.length : 0.5, selloutRate: home.length ? home.filter(x => x.fill >= 0.995).length / home.length : 0 }; })(),
        // New offers every Tuesday (UTC).
        nextOffersAt: (desk.week + 1) * 7 * 86_400_000 + 5 * 86_400_000,
      } : null,
    } : null,
  }, { headers: { 'cache-control': 'no-store' } });
}

/** This week's sponsorship market for a franchise as it stands: every slot, its deal or its offers. */
async function sponsorDesk(franchiseId: string, s: import('@/lib/tycoon/economy').EconomyState, now: number) {
  const sp = await import('@/lib/tycoon/sponsors');
  const { facilityStats } = await import('@/lib/tycoon/catalog');
  const standing = { capacity: facilityStats(s.facilities).capacity, interest: s.interest, titles: s.titles };
  const taken = s.deals.map(d => d.brand);
  const week = sp.offerWeek(now);
  return {
    sp, standing, week,
    slots: sp.SLOTS.map(slot => {
      const deal = s.deals.find(d => d.slot === slot.id) ?? null;
      const open = slot.open(s.facilities);
      return {
        id: slot.id, open,
        deal: deal ? { ...deal, buyout: sp.buyoutCost(deal) } : null,
        offers: open && !deal ? sp.offersFor({ franchiseId, slot: slot.id, week, standing, taken, loyalty: s.loyalty }) : [],
      };
    }),
  };
}

const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await context(req, (await params).id);
  if (!c.manager) return NextResponse.json({ error: 'Only this franchise’s manager can run it.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { action?: string; prices?: Record<string, unknown>; track?: string; score?: unknown; promo?: unknown };
  const [{ economyOf, recordDecision }, { shop, cash }, { TRACK }] = await Promise.all([
    import('@/lib/tycoon/service'), import('@/lib/tycoon/economy'), import('@/lib/tycoon/catalog'),
  ]);
  const now = Date.now();

  if (body.action === 'prices') {
    const ticket = num(body.prices?.ticket, 5, 500), concession = num(body.prices?.concession, 1, 50), parking = num(body.prices?.parking, 0, 200);
    if (ticket === null || concession === null || parking === null) return NextResponse.json({ error: 'Tickets $5 to $500, food $1 to $50, parking up to $200.' }, { status: 400 });
    const { decisionsOf } = await import('@/lib/tycoon/service');
    const before = (await decisionsOf(c.franchiseId)).filter(d => d.kind === 'prices').at(-1);
    const was = before && before.kind === 'prices' ? before.prices.ticket : null;
    await recordDecision(c.franchiseId, { at: now, kind: 'prices', prices: { ticket, concession, parking } });
    // Worth a post when the ticket moves a tenth or more (or is set for the first time).
    if (was === null || Math.abs(ticket - was) / Math.max(1, was) >= 0.1) tell(c.franchiseId, { kind: 'prices', ticket, was });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'promo') {
    const { PROMOS, PROMO_MAX, PROMO_COOLDOWN, isPromo } = await import('@/lib/tycoon/economy');
    const score = Number(body.score);
    if (!isPromo(body.promo)) return NextResponse.json({ error: 'Pick a promotion.' }, { status: 400 });
    if (!Number.isInteger(score) || score < 0 || score > PROMO_MAX) return NextResponse.json({ error: `A score is 0 to ${PROMO_MAX}.` }, { status: 400 });
    const { decisionsOf } = await import('@/lib/tycoon/service');
    const last = (await decisionsOf(c.franchiseId)).filter(d => d.kind === 'promo').at(-1);
    if (last && now - last.at < PROMO_COOLDOWN) return NextResponse.json({ error: 'There is already a promotion this week.', nextAt: last.at + PROMO_COOLDOWN }, { status: 429 });
    const p = PROMOS[body.promo];
    if (p.cost) {
      const s = await economyOf(c.site, c.franchiseId, now);
      if (!s) return NextResponse.json({ error: 'The league’s history is not ready yet.' }, { status: 503 });
      if (s.vc < p.cost) return NextResponse.json({ error: `${p.name} costs ${cash(p.cost)}. You have ${cash(s.vc)}.` }, { status: 400 });
    }
    await recordDecision(c.franchiseId, { at: now, kind: 'promo', promo: body.promo, score });
    tell(c.franchiseId, { kind: 'promo', promo: body.promo, score });
    return NextResponse.json({ ok: true, promo: body.promo, score });
  }

  if (body.action === 'sponsor') {
    const sp = await import('@/lib/tycoon/sponsors');
    const b2 = body as { offer?: unknown; structure?: unknown };
    if (!sp.isStructure(b2.structure) || typeof b2.offer !== 'string') return NextResponse.json({ error: 'Pick an offer and how it pays.' }, { status: 400 });
    const s = await economyOf(c.site, c.franchiseId, now);
    if (!s) return NextResponse.json({ error: 'The league’s history is not ready yet.' }, { status: 503 });
    const desk = await sponsorDesk(c.franchiseId, s, now);
    const offer = desk.slots.flatMap(x => x.offers).find(o => o.id === b2.offer);
    if (!offer) return NextResponse.json({ error: 'That offer is gone. This week’s offers have changed, or the slot is taken.' }, { status: 409 });
    const terms = sp.termsOf(offer, b2.structure);
    await recordDecision(c.franchiseId, { at: now, kind: 'sponsor', slot: offer.slot, brand: offer.brand, structure: b2.structure, clause: offer.clause, term: offer.term, ...terms });
    tell(c.franchiseId, { kind: 'sponsor', brand: offer.brand, slot: offer.slot, term: offer.term });
    return NextResponse.json({ ok: true, signed: { ...offer, structure: b2.structure, ...terms } });
  }

  if (body.action === 'sponsor-end') {
    const sp = await import('@/lib/tycoon/sponsors');
    const slot = (body as { slot?: unknown }).slot;
    if (!sp.isSlot(slot)) return NextResponse.json({ error: 'Which deal?' }, { status: 400 });
    const s = await economyOf(c.site, c.franchiseId, now);
    if (!s) return NextResponse.json({ error: 'The league’s history is not ready yet.' }, { status: 503 });
    const deal = s.deals.find(d => d.slot === slot);
    if (!deal) return NextResponse.json({ error: 'There is no deal there to end.' }, { status: 400 });
    const { VC_PER_DOLLAR } = await import('@/lib/tycoon/economy');
    const cost = sp.buyoutCost(deal) * VC_PER_DOLLAR;
    if (s.vc < cost) return NextResponse.json({ error: `Buying them out costs ${cash(cost)}. You have ${cash(s.vc)}.` }, { status: 400 });
    await recordDecision(c.franchiseId, { at: now, kind: 'sponsor-end', slot });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'build' && body.track && body.track in TRACK) {
    const s = await economyOf(c.site, c.franchiseId, now);
    if (!s) return NextResponse.json({ error: 'The league’s history is not ready yet.' }, { status: 503 });
    const item = shop(s).find(t => t.track === body.track)!;
    if (item.blocked) return NextResponse.json({ error: item.blocked }, { status: 400 });
    if (!item.next) return NextResponse.json({ error: `${item.name} is fully built.` }, { status: 400 });
    if (!item.next.affordable) return NextResponse.json({ error: `That costs ${cash(item.next.cost)}. You have ${cash(s.vc)}.` }, { status: 400 });
    await recordDecision(c.franchiseId, { at: now, kind: 'build', track: body.track as TrackId });
    tell(c.franchiseId, { kind: 'build', track: body.track as TrackId, name: item.next.name, blurb: item.next.blurb });
    return NextResponse.json({ ok: true, built: item.next.name });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
