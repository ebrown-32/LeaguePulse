/**
 * "This is my team": a signed-in person claims a franchise of a league.
 * The league's admins approve or decline it. See lib/franchise.
 */

import { redirect } from 'next/navigation';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import { getTenant, isLive } from '@/lib/platform/tenants';
import ClaimView from '@/components/platform/ClaimView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Claim your team | LeaguePulse', robots: { index: false } };

export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ slug?: string; franchise?: string }> }) {
  if (!accountsEnabled()) redirect('/');
  const { slug = '', franchise = '' } = await searchParams;
  const me = await signedInAccount();
  if (!me) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/account/claim?slug=${encodeURIComponent(slug)}&franchise=${encodeURIComponent(franchise)}`)}`);

  const t = slug ? await getTenant(slug) : null;
  const [{ franchiseInfo }, store, links] = await Promise.all([
    import('@/lib/franchise/lookup'), import('@/lib/franchise/store'), import('@/lib/franchise/links'),
  ]);
  const info = t && isLive(t) && franchise ? await franchiseInfo(t, franchise).catch(() => null) : null;
  if (!t || !info) return <ClaimView state={{ kind: 'unknown' }} />;

  const { roleOf } = await import('@/lib/platform/members');
  const [f, claims, invite, role, theirs] = await Promise.all([
    store.getFranchise(slug, franchise), store.getClaims(slug), store.inviteFor(slug, franchise, me.email),
    roleOf(slug, me.userId), store.managedIn(slug, me.userId),
  ]);
  const mine = claims.find(c => c.franchiseId === franchise && c.userId === me.userId && c.status === 'pending');
  const host = (await (await import('next/headers')).headers()).get('host') ?? '';
  const leagueUrl = `${links.leagueOrigin(new Request(`http://${host}/`), slug)}/team/${encodeURIComponent(franchise)}`;
  const base = { slug, franchiseId: franchise, leagueName: info.leagueName, teamName: info.teamName, manager: info.manager, avatar: info.avatar, leagueUrl, email: me.email };
  if (f.manager?.userId === me.userId) return <ClaimView state={{ kind: 'yours', ...base, editHref: links.openPath(slug, franchise) }} />;
  if (f.manager) return <ClaimView state={{ kind: 'taken', ...base }} />;
  if (theirs) return <ClaimView state={{ kind: 'has-team', ...base }} />;
  if (mine) return <ClaimView state={{ kind: 'pending', ...base, claimId: mine.id }} />;
  return <ClaimView state={{ kind: 'open', ...base, instant: invite ? 'invited' : role ? 'admin' : null }} />;
}
