/**
 * The signed-in user's leagues. Reading this also links anything that is
 * theirs but not yet linked: invites to their email, and leagues bought with
 * it before accounts existed (see members.claimForUser).
 */

import { NextResponse } from 'next/server';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { claimForUser, getInvites, getMembers } from '@/lib/platform/members';
import { getTenant } from '@/lib/platform/tenants';
import { PLATFORM } from '@/lib/platform/config';
import { runAsTenant } from '@/lib/tenant/context';
import { getTheme } from '@/lib/themeStorage';
import { providerOf } from '@/lib/providers/ids';

/**
 * The league's icon as its site shows it. An uploaded logo is served by the
 * league's own address, so it is linked there; the built-in brand icons live
 * on every address.
 */
function logoFor(logoUrl: string | null | undefined, site: string): string | null {
  const u = logoUrl?.trim();
  if (!u) return null;
  if (/^https:\/\//.test(u) || u.startsWith('/brand/')) return u;
  return u.startsWith('/') ? `${site}${u}` : null;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!accountsEnabled()) return NextResponse.json({ error: 'Accounts are not enabled' }, { status: 404 });
  const me = await signedInAccount();
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });

  const slugs = await claimForUser(me.userId, me.email);
  const leagues = (await Promise.all(slugs.map(async slug => {
    const t = await getTenant(slug);
    if (!t) return null;
    const members = await getMembers(slug);
    const role = members.find(m => m.userId === me.userId)?.role ?? null;
    if (!role) return null;
    const url = `https://${slug}.${PLATFORM.rootDomain}`;
    const theme = await runAsTenant(t, () => getTheme()).catch(() => null);
    return {
      slug, name: theme?.leagueName?.trim() || t.leagueName, url,
      logo: logoFor(theme?.logoUrl, url),
      provider: providerOf(t.leagueId),
      role, status: t.status, plan: t.plan, comp: !t.stripeSubscriptionId,
      canBill: role === 'owner' && Boolean(t.stripeCustomerId),
      // People are shown to the owner, who manages them.
      members: role === 'owner' ? members.map(m => ({ userId: m.userId, email: m.email, role: m.role, you: m.userId === me.userId })) : [],
      invites: role === 'owner' ? (await getInvites(slug)).map(i => ({ email: i.email, role: i.role })) : [],
    };
  }))).filter(Boolean);

  const { isOperatorAccount } = await import('@/lib/platform/operator');
  return NextResponse.json({
    account: { email: me.email, name: me.name, emailVerified: Boolean(me.email) },
    operator: await isOperatorAccount(),
    leagues,
  });
}
