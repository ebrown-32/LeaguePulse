'use client';

/**
 * The claim page: one team, one question ("is this you?"), and where the
 * claim stands. On the product site, signed in.
 */

import { useState } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { productDisplay } from './fonts';
import { Lockup, Tick } from './marks';
import { PLATFORM } from '@/lib/platform/config';

interface Base { slug: string; franchiseId: string; leagueName: string; teamName: string; manager: string; avatar: string | null; leagueUrl: string; email: string | null }
export type ClaimState =
  | { kind: 'unknown' }
  /** instant: approved on the spot, for someone invited or one of the league's admins. */
  | ({ kind: 'open'; instant: 'invited' | 'admin' | null } & Base)
  | ({ kind: 'has-team' } & Base)
  | ({ kind: 'pending'; claimId: string } & Base)
  | ({ kind: 'taken' } & Base)
  | ({ kind: 'yours'; editHref: string } & Base);

export default function ClaimView({ state: initial }: { state: ClaimState }) {
  const [state, setState] = useState(initial);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (state.kind !== 'open') return;
    setBusy(true); setError('');
    const r = await fetch('/api/platform/franchise/claim', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: state.slug, franchiseId: state.franchiseId, note }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok && d?.status === 'approved') setState({ ...state, kind: 'yours', editHref: d.editHref });
    else if (r?.ok) setState({ ...state, kind: 'pending', claimId: d?.claimId ?? '' });
    else setError(d?.error ?? 'The claim did not go through. Try again in a moment.');
    setBusy(false);
  };

  const withdraw = async () => {
    if (state.kind !== 'pending') return;
    setBusy(true); setError('');
    const r = await fetch('/api/platform/franchise/claim', {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: state.slug, claimId: state.claimId }),
    }).catch(() => null);
    if (r?.ok) setState({ ...state, kind: 'open', instant: null });
    else setError('Could not withdraw the claim.');
    setBusy(false);
  };

  return (
    <div className={cn('lp-brand min-h-screen font-body', productDisplay.variable)}>
      <header className="border-b border-border bg-card/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:h-16 sm:px-5">
          <Link href="/" aria-label={`${PLATFORM.name} home`}><Lockup size={28} text={19} /></Link>
          <div className="ml-auto"><UserButton /></div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-16 pt-10 sm:pt-16">
        {state.kind === 'unknown' ? (
          <div className="rounded-[24px] border border-border bg-card p-7 text-center">
            <h1 className="lp-display text-[26px] font-extrabold tracking-[-0.02em]">That team could not be found.</h1>
            <p className="mt-2 text-[14.5px] text-muted-foreground">Open the claim button from the team&apos;s page on your league&apos;s site.</p>
            <Link href="/account" className="mt-6 inline-flex rounded-full bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background">My leagues</Link>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="rounded-[24px] border border-border bg-card p-6 sm:p-8">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{state.leagueName}</p>
            <div className="mt-4 flex items-center gap-4">
              {state.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={state.avatar} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-[24px] font-bold">{state.teamName.slice(0, 1)}</span>}
              <div className="min-w-0">
                <h1 className="lp-display truncate text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{state.teamName}</h1>
                <p className="text-[14px] text-muted-foreground">{state.manager} on {state.franchiseId.startsWith('espn-') ? 'ESPN' : 'Sleeper'}</p>
              </div>
            </div>

            {state.kind === 'open' && state.instant && (
              <>
                <p className="mt-6 text-[15px] leading-relaxed">
                  {state.instant === 'invited'
                    ? <>You&apos;ve been invited to manage this team. Accept, and you can give its franchise page your own logo, colors, motto and story.</>
                    : <>You&apos;re an admin of this league, so claiming your team is approved straight away. You can manage one team per league.</>}
                </p>
                <button onClick={send} disabled={busy}
                  className="mt-6 w-full rounded-full bg-foreground px-5 py-3.5 text-[15px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60">
                  {busy ? 'One moment' : state.instant === 'invited' ? 'Accept and manage this team' : 'This is my team'}
                </button>
              </>
            )}

            {state.kind === 'open' && !state.instant && (
              <>
                <p className="mt-6 text-[15px] leading-relaxed">
                  Is this your team? Claim it and, once the league&apos;s admins approve, you can give its franchise page your own logo, colors, motto and story.
                </p>
                <label className="mt-5 block text-[13px] font-semibold" htmlFor="note">A note for the admins <span className="font-normal text-muted-foreground">(optional)</span></label>
                <textarea id="note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
                  placeholder="Hey, it's me. I've had this team since 2019."
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] outline-none focus:border-foreground/40" />
                <p className="mt-2 text-[12.5px] text-muted-foreground">The admins will see your name and {state.email ?? 'email'}.</p>
                <button onClick={send} disabled={busy}
                  className="mt-6 w-full rounded-full bg-foreground px-5 py-3.5 text-[15px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-60">
                  {busy ? 'Sending' : 'Claim this team'}
                </button>
              </>
            )}

            {state.kind === 'pending' && (
              <div className="mt-6">
                <p className="flex items-center gap-2 text-[15px] font-semibold"><Tick size={18} />Claim sent.</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
                  The league&apos;s admins will look at it. Once they approve, you can manage it from the pencil on your team&apos;s page, or from My leagues.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <a href={state.leagueUrl} className="rounded-full bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background">Back to the league</a>
                  <button onClick={withdraw} disabled={busy} className="rounded-full border border-border px-5 py-2.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground">Withdraw the claim</button>
                </div>
              </div>
            )}

            {state.kind === 'has-team' && (
              <p className="mt-6 text-[14.5px] leading-relaxed text-muted-foreground">
                You already manage a team in this league. Each person manages one; if this one is yours instead, ask the league&apos;s admin to move you.
              </p>
            )}

            {state.kind === 'taken' && (
              <p className="mt-6 text-[14.5px] leading-relaxed text-muted-foreground">
                This team already has a manager on LeaguePulse. If that is not right, ask your league&apos;s admin.
              </p>
            )}

            {state.kind === 'yours' && (
              <div className="mt-6">
                <p className="text-[15px]">You manage this franchise.</p>
                <a href={state.editHref} className="mt-5 inline-flex rounded-full bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background">Manage your franchise</a>
              </div>
            )}

            {error && <p className="mt-4 text-[13.5px] text-[hsl(var(--signal))]">{error}</p>}
          </motion.div>
        )}
      </main>
    </div>
  );
}
