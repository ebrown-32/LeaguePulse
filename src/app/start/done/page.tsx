/**
 * Where Stripe sends a buyer after checkout.
 *
 * The site is created by Stripe's webhook, which usually lands within a
 * second or two but is not guaranteed to beat the browser here. So this page
 * reads the checkout, shows the address straight away, and refreshes itself
 * until the site exists rather than sending someone to a league that 404s.
 */

import Link from 'next/link';
import { stripe } from '@/lib/platform/stripe';
import { getTenant } from '@/lib/platform/tenants';
import { runAsTenant } from '@/lib/tenant/context';
import { adminPasswordSet } from '@/lib/tenant/admin';
import ClaimAdmin from '@/components/platform/ClaimAdmin';
import { PLATFORM } from '@/lib/platform/config';
import TrackOnce from '@/components/analytics/TrackOnce';

export const dynamic = 'force-dynamic';

export default async function DonePage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session: id } = await searchParams;
  const s = stripe();
  const session = s && id ? await s.checkout.sessions.retrieve(id).catch(() => null) : null;
  const slug = session?.metadata?.slug ?? null;
  const tenant = slug ? await getTenant(slug).catch(() => null) : null;
  const url = slug ? `https://${slug}.${PLATFORM.rootDomain}` : null;
  // The owner sets the admin password here, once, while they still hold the
  // checkout that proves they paid. Read inside the league's own storage.
  const needsAdmin = tenant && session?.status === 'complete'
    ? !(await runAsTenant(tenant, () => adminPasswordSet()).catch(() => true))
    : false;

  return (
    <div className="lp-brand flex min-h-screen items-center justify-center px-5 font-body">
      {!tenant && slug && <meta httpEquiv="refresh" content="2" />}
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        {!session ? (
          <>
            <h1 className="font-display text-[26px] font-bold">We couldn&apos;t find that checkout.</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">If you were charged, your site is still being set up. Check your email for the receipt.</p>
            <Link href="/start" className="mt-6 inline-block text-[14px] font-semibold text-primary">Back to sign-up</Link>
          </>
        ) : (
          <>
            {tenant && session.status === 'complete' && (
              <TrackOnce event="league_site_purchased" once={session.id} props={{
                plan: session.metadata?.plan, tier: session.metadata?.tier, signed_in: Boolean(session.metadata?.userId),
                provider: tenant.leagueId.startsWith('espn-') ? 'espn' : 'sleeper',
              }} />
            )}
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">{tenant ? 'You are live' : 'Setting up'}</p>
            <h1 className="mt-3 font-display text-[30px] font-bold leading-tight">{session.metadata?.leagueName || 'Your league'}</h1>
            <p className="mt-3 text-[14px] text-muted-foreground">
              {!tenant ? 'Creating your site. This takes a few seconds.'
                : needsAdmin ? 'One more thing: a password for the admin, where you make the site yours.'
                : 'Next, make it yours: your logo and colors, the media desk and your managers. A few minutes, with a guide.'}
            </p>
            {tenant && slug && session.metadata?.userId ? (
              // Bought while signed in: straight into the admin's setup guide, already signed in.
              <a href={`/api/platform/account/open?slug=${encodeURIComponent(slug)}&setup=1`} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3.5 text-[15px] font-semibold text-primary-foreground">
                Set up your site
              </a>
            ) : tenant && url && !needsAdmin ? (
              <a href={`${url}/admin?setup=1`} className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3.5 text-[15px] font-semibold text-primary-foreground">
                Set up your site
              </a>
            ) : null}
            {needsAdmin && id && url && <ClaimAdmin session={id} siteUrl={url} />}
            {url && (
              <a href={tenant ? url : undefined}
                className={`mt-3 inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3.5 text-[14px] font-semibold ${tenant ? '' : 'text-muted-foreground'}`}>
                {url.replace('https://', '')}
              </a>
            )}
            {tenant && session.metadata?.userId && (
              <p className="mt-4 text-[12.5px] text-muted-foreground">
                The admin is always one tap away in <Link href="/account" className="font-semibold text-foreground underline-offset-2 hover:underline">My leagues</Link>, and in your account menu on the site.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
