/** Shown on a league address that has no live league behind it. */

import { PLATFORM } from '@/lib/platform/config';

export default function LeagueUnavailable({ reason, name }: { reason: 'missing' | 'ended'; name?: string }) {
  return (
    <div className="lp-brand flex min-h-screen items-center justify-center px-5 font-body">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">
          {reason === 'ended' ? 'Paused' : 'Nothing here yet'}
        </p>
        <h1 className="mt-3 font-display text-[26px] font-bold leading-tight">
          {reason === 'ended' ? `${name || 'This league'} is paused` : 'No league lives at this address'}
        </h1>
        <p className="mt-3 text-[14px] text-muted-foreground">
          {reason === 'ended'
            ? 'The League Pass for this league has ended. Its history is kept, and it comes back as soon as the subscription is renewed.'
            : `It could be yours. Any Sleeper league can have a home on ${PLATFORM.name}.`}
        </p>
        <a href={`https://${PLATFORM.rootDomain}/start`}
          className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground">
          {reason === 'ended' ? 'Renew' : 'Set up a league'}
        </a>
      </div>
    </div>
  );
}
