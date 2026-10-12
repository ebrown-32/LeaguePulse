/** A league's address before its site can be served. See proxy.ts. */

import Link from 'next/link';
import { getTenant } from '@/lib/platform/tenants';
import { PLATFORM } from '@/lib/platform/config';

export const dynamic = 'force-dynamic';

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  const tenant = slug ? await getTenant(slug).catch(() => null) : null;
  return (
    <div className="lp-brand flex min-h-screen items-center justify-center px-5 font-body">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">{tenant ? 'Almost ready' : 'Not taken yet'}</p>
        <h1 className="mt-3 font-display text-[28px] font-bold leading-tight">
          {tenant ? tenant.leagueName || 'Your league' : `${slug ?? 'This'}.${PLATFORM.rootDomain}`}
        </h1>
        <p className="mt-3 text-[14px] text-muted-foreground">
          {tenant ? 'This league’s site is being prepared. Check back shortly.' : 'No league lives here yet. It could be yours.'}
        </p>
        {!tenant && (
          <Link href={`https://${PLATFORM.rootDomain}/start`} className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground">
            Set up a league
          </Link>
        )}
      </div>
    </div>
  );
}
