/**
 * Pick'em (lib/pickem).
 *
 *   GET   the week open for picks, the week being played (everyone's picks, now they're locked),
 *         the last week finished, with its results, the season table and the Cup's past winners; and, for whoever's asking, their own card.
 *         `?team=<sleeper user id>` with `x-pickem-key` asks for a team held by a key.
 *   POST  { team, week, picks: { matchupId: rosterId }, lock } saves a card. A signed-in manager
 *         (x-visitor-pass) picks for their own franchise whatever `team` says.
 *
 * Never cached: a card is personal, and the lock changes it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { leagueConfigured } from '@/config/league';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'cache-control': 'no-store' };

/** Who's asking: the franchise they're signed in to, if any. */
async function signedInTeam(req: NextRequest): Promise<string | null> {
  const [{ verifyVisitorPass }, { accountsEnabled }] = await Promise.all([import('@/lib/platform/visitorPass'), import('@/lib/platform/account')]);
  if (!accountsEnabled()) return null;
  const me = verifyVisitorPass(req.headers.get('x-visitor-pass'));
  if (!me) return null;
  const [{ currentTenant }, { managedIn }] = await Promise.all([import('@/lib/tenant/context'), import('@/lib/franchise/store')]);
  const t = await currentTenant();
  return t ? managedIn(t.slug, me.userId).catch(() => null) : null;
}

/** Whether a manager has signed in for this team (hosted): then only they pick for it. */
async function claimed(userId: string): Promise<boolean> {
  const { accountsEnabled } = await import('@/lib/platform/account');
  if (!accountsEnabled()) return false;
  const [{ currentTenant }, { getFranchise }] = await Promise.all([import('@/lib/tenant/context'), import('@/lib/franchise/store')]);
  const t = await currentTenant();
  if (!t) return false;
  return Boolean((await getFranchise(t.slug, userId).catch(() => null))?.manager);
}

export async function GET(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  try {
    const p = await import('@/lib/pickem');
    const s = await p.pickemSeason();
    const weeks = await p.pickemWeeks(s);
    const [open, live, done, table, teams, mine] = await Promise.all([
      weeks.open ? p.pickemWeek(s, weeks.open) : null,
      weeks.live ? p.pickemWeek(s, weeks.live) : null,
      weeks.done ? p.pickemWeek(s, weeks.done) : null,
      p.pickemTable(s), p.pickemTeams(s), signedInTeam(req),
    ]);
    const champions = await p.pickemChampions(s, table);
    const week = weeks.open;

    const asked = mine ?? req.nextUrl.searchParams.get('team');
    let me: { userId: string; signedIn: boolean; claimed: boolean; picks: Awaited<ReturnType<typeof p.myPicks>>; allowed: boolean } | null = null;
    if (asked && teams.some(t => t.userId === asked)) {
      const isClaimed = !mine && (await claimed(asked));
      const allowed = Boolean(mine) || (!isClaimed && (await p.keyHolds(s.leagueId, asked, req.headers.get('x-pickem-key'))));
      me = { userId: asked, signedIn: Boolean(mine), claimed: isClaimed, allowed, picks: allowed && week ? await p.myPicks(s, week, asked) : null };
    }
    const { accountsEnabled } = await import('@/lib/platform/account');
    return NextResponse.json({
      season: s.season, lastWeek: s.lastWeek, over: s.over, accounts: accountsEnabled(),
      // Winnings go to the franchise's bank: franchises are the hosted product's.
      money: process.env.LP_HOSTED === '1',
      card: open?.week ?? null,
      live: live ? { card: live.week, picks: live.picks } : null,
      previous: done ? { card: done.week, picks: done.picks } : null,
      table, champions, teams, me,
    }, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/pickem]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load Pick\'em' }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  if (!(await leagueConfigured())) return NextResponse.json({ error: 'No league configured' }, { status: 400 });
  const body = await req.json().catch(() => null) as { team?: string; week?: number; picks?: Record<string, number>; lock?: number | null } | null;
  if (!body || typeof body.picks !== 'object' || !Number.isInteger(body.week)) return NextResponse.json({ error: 'Send your picks.' }, { status: 400 });
  try {
    const p = await import('@/lib/pickem');
    const mine = await signedInTeam(req);
    const team = mine ?? String(body.team ?? '');
    if (!team) return NextResponse.json({ error: 'Pick your team first.' }, { status: 400 });
    const s = await p.pickemSeason();
    const out = await p.savePicks(s, body.week!, team, { picks: body.picks!, lock: body.lock ?? null }, {
      signedIn: Boolean(mine), managed: !mine && (await claimed(team)), key: req.headers.get('x-pickem-key'),
    });
    return NextResponse.json({ ok: true, picks: out.picks, key: out.key, team }, { headers: NO_STORE });
  } catch (err) {
    const { PickemError } = await import('@/lib/pickem');
    if (err instanceof PickemError) return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
    console.error('[api/pickem] save', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not save your picks.' }, { status: 500, headers: NO_STORE });
  }
}
