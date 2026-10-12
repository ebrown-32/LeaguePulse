/** Where a one-time admin recovery link lands. See lib/platform/recovery. */

import { recoverySlug } from '@/lib/platform/recovery';
import { PLATFORM } from '@/lib/platform/config';
import RecoverAdmin from '@/components/platform/RecoverAdmin';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false } };

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const slug = await recoverySlug(token).catch(() => null);
  return (
    <div className="lp-brand flex min-h-screen items-center justify-center px-5 font-body">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        {slug ? (
          <>
            <h1 className="font-display text-[26px] font-bold">Reset your admin password</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">For {slug}.{PLATFORM.rootDomain}. This link works once.</p>
            <RecoverAdmin token={token} siteUrl={`https://${slug}.${PLATFORM.rootDomain}`} />
          </>
        ) : (
          <>
            <h1 className="font-display text-[26px] font-bold">This link has expired.</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              Recovery links last a day and work once.
              {PLATFORM.supportEmail ? <> Email <a className="text-primary" href={`mailto:${PLATFORM.supportEmail}`}>{PLATFORM.supportEmail}</a> for a new one.</> : ' Ask support for a new one.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
