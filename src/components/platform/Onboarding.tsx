'use client';

/**
 * Sign-up: find your league, pick an address, start the trial.
 *
 * Three steps on one page, each sliding in once the one before it is done,
 * so the whole flow is visible as it fills in rather than a wizard that hides
 * where you are.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight, Check, Search, AlertTriangle, ExternalLink } from '@/components/icons';
import { PLATFORM, PLANS, slugify } from '@/lib/platform/config';
import { PulseMark } from './Landing';

interface FoundLeague {
  leagueId: string; name: string; season: string; avatar: string | null;
  teams: number; format: string; scoring: string; status: string; hostedAt: string | null;
}

const avatarUrl = (id: string | null) => (id ? `https://sleepercdn.com/avatars/thumbs/${id}` : null);

export default function Onboarding() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ user: { name: string } | null; leagues: FoundLeague[] } | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [league, setLeague] = useState<FoundLeague | null>(null);
  const [slug, setSlug] = useState(params.get('slug') ?? '');
  const [slugState, setSlugState] = useState<{ ok: boolean; reason?: string; slug: string } | null>(null);
  const [plan, setPlan] = useState<'season' | 'monthly'>(params.get('plan') === 'monthly' ? 'monthly' : 'season');
  const [email, setEmail] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<{ msg: string; missing?: string[] } | null>(null);

  const find = async (value: string) => {
    const v = value.trim();
    if (!v) return;
    setSearching(true); setFindError(null); setFound(null); setLeague(null);
    try {
      const r = await fetch(`/api/platform/lookup?q=${encodeURIComponent(v)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not look that up');
      setFound(d);
      if (d.leagues.length === 1 && !d.leagues[0].hostedAt) choose(d.leagues[0]);
    } catch (e: any) {
      setFindError(e.message);
    } finally {
      setSearching(false);
    }
  };

  // Arriving from the landing page with a username already typed.
  useEffect(() => {
    const initial = params.get('q') ?? params.get('league');
    if (initial) find(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (l: FoundLeague) => {
    setLeague(l);
    setSlug(s => s || slugify(l.name));
    setStartError(null);
  };

  // Check the address as it is typed, after a pause.
  const clean = useMemo(() => slugify(slug), [slug]);
  useEffect(() => {
    if (!league || !clean) { setSlugState(null); return; }
    const t = setTimeout(async () => {
      const d = await fetch(`/api/platform/slug?s=${encodeURIComponent(clean)}&league=${league.leagueId}`)
        .then(r => r.json()).catch(() => null);
      if (d) setSlugState(d);
    }, 350);
    return () => clearTimeout(t);
  }, [clean, league]);

  const start = async () => {
    if (!league || !slugState?.ok) return;
    setStarting(true); setStartError(null);
    try {
      const r = await fetch('/api/platform/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leagueId: league.leagueId, slug: clean, plan, email }),
      });
      const d = await r.json();
      if (d.url) { window.location.href = d.url; return; }
      setStartError({ msg: d.error ?? 'Could not start checkout', missing: d.missing });
    } catch {
      setStartError({ msg: 'Could not reach the server' });
    } finally {
      setStarting(false);
    }
  };

  const step = !league ? 1 : !slugState?.ok ? 2 : 3;

  return (
    <div className="lp-brand min-h-screen font-body">
      <div className="lp-brand-hero-bg pointer-events-none fixed inset-0 opacity-60" />
      <header className="relative mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Link href="/landing" className="flex items-center gap-2">
          <PulseMark /><span className="font-display text-[17px] font-bold">{PLATFORM.name}</span>
        </Link>
        <Steps step={step} />
      </header>

      <main className="relative mx-auto max-w-3xl space-y-5 px-5 pb-24 pt-8">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.03em] sm:text-[42px]">Let&apos;s find your league.</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Your Sleeper username lists your leagues. Or paste a league ID from the league&apos;s settings.</p>
        </div>

        {/* 1. Find */}
        <Card n={1} title="Find your league" done={!!league}>
          <form onSubmit={e => { e.preventDefault(); find(q); }} className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Sleeper username or league ID"
                className="w-full rounded-xl border border-border bg-background/70 py-3 pl-10 pr-3 text-[15px] outline-none focus:border-primary/60" />
            </label>
            <button disabled={searching || !q.trim()}
              className="rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {searching ? 'Looking' : 'Find'}
            </button>
          </form>
          {findError && <p className="mt-3 flex items-center gap-2 text-[13px] text-red-400"><AlertTriangle className="h-4 w-4" />{findError}</p>}
          {found && (
            <div className="mt-4 space-y-2">
              {found.user && <p className="text-[12.5px] text-muted-foreground">{found.leagues.length} league{found.leagues.length === 1 ? '' : 's'} for {found.user.name} this season</p>}
              {found.leagues.length === 0 && <p className="text-[13px] text-muted-foreground">No NFL leagues this season. Paste a league ID instead.</p>}
              {found.leagues.map(l => (
                <button key={l.leagueId} onClick={() => !l.hostedAt && choose(l)} disabled={!!l.hostedAt}
                  className={cn('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                    league?.leagueId === l.leagueId ? 'border-primary bg-primary/10' : 'border-border bg-background/50 hover:border-primary/40',
                    l.hostedAt && 'cursor-default opacity-70')}>
                  <LeagueAvatar l={l} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[15.5px] font-bold">{l.name}</span>
                    <span className="block text-[12px] text-muted-foreground">{l.teams} teams · {l.format} · {l.scoring} · {l.season}</span>
                  </span>
                  {l.hostedAt ? (
                    <a href={`https://${l.hostedAt}.${PLATFORM.rootDomain}`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary" onClick={e => e.stopPropagation()}>
                      Already live <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : league?.leagueId === l.leagueId ? <Check className="h-5 w-5 text-primary" /> : null}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* 2. Address */}
        <AnimatePresence>
          {league && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card n={2} title="Pick its address" done={!!slugState?.ok}>
                <div className={cn('flex items-center overflow-hidden rounded-xl border bg-background/70 text-[15px]',
                  slugState && !slugState.ok ? 'border-red-500/60' : slugState?.ok ? 'border-primary/60' : 'border-border')}>
                  <span className="pl-3 text-muted-foreground">https://</span>
                  <input value={slug} onChange={e => setSlug(e.target.value)} spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-1 py-3 font-semibold outline-none" />
                  <span className="pr-3 text-muted-foreground">.{PLATFORM.rootDomain}</span>
                </div>
                <p className={cn('mt-2 text-[12.5px]', slugState?.ok ? 'text-primary' : slugState ? 'text-red-400' : 'text-muted-foreground')}>
                  {slugState?.ok ? `${clean}.${PLATFORM.rootDomain} is yours if you want it.` : slugState?.reason ?? 'Letters, numbers and hyphens.'}
                </p>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. Plan */}
        <AnimatePresence>
          {league && slugState?.ok && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card n={3} title="Start your free trial">
                <div className="grid gap-2 sm:grid-cols-2">
                  {([['season', `$${PLANS.pro.season}`, 'per season', 'Best value'], ['monthly', `$${PLANS.pro.monthly}`, 'per month', 'Pause any time']] as const).map(([id, price, per, note]) => (
                    <button key={id} onClick={() => setPlan(id)}
                      className={cn('rounded-2xl border p-4 text-left transition', plan === id ? 'border-primary bg-primary/10' : 'border-border bg-background/50 hover:border-primary/40')}>
                      <span className="flex items-center justify-between">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{id === 'season' ? 'Season' : 'Monthly'}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-semibold', plan === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{note}</span>
                      </span>
                      <span className="mt-2 block font-display text-[30px] font-bold leading-none">{price}<span className="ml-1 text-[13px] font-normal text-muted-foreground">{per}</span></span>
                    </button>
                  ))}
                </div>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email for receipts (optional)"
                  className="mt-3 w-full rounded-xl border border-border bg-background/70 px-3 py-3 text-[14.5px] outline-none focus:border-primary/60" />
                <button onClick={start} disabled={starting}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-[0_0_30px_hsl(151_82%_50%/0.3)] transition hover:brightness-110 disabled:opacity-60">
                  {starting ? 'Opening checkout' : `Start ${PLANS.pro.trialDays} days free`} <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-2 text-center text-[12px] text-muted-foreground">
                  No card needed for the trial. If you don&apos;t add one, it simply ends.
                </p>
                {startError && (
                  <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[13px]">
                    <p className="font-semibold text-amber-300">{startError.msg}</p>
                    {startError.missing?.length ? (
                      <p className="mt-1 text-muted-foreground">Set {startError.missing.join(', ')} in the deployment&apos;s environment to turn on checkout.</p>
                    ) : null}
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5">
      {[1, 2, 3].map(n => (
        <li key={n} className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition',
          n < step ? 'bg-primary text-primary-foreground' : n === step ? 'bg-primary/15 text-primary ring-1 ring-primary/50' : 'bg-muted text-muted-foreground')}>
          {n < step ? <Check className="h-3.5 w-3.5" /> : n}
        </li>
      ))}
    </ol>
  );
}

function Card({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card/90 p-5 backdrop-blur sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold',
          done ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary')}>
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <h2 className="font-display text-[18px] font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function LeagueAvatar({ l }: { l: FoundLeague }) {
  const src = avatarUrl(l.avatar);
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border" />
    : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 font-display font-bold text-primary">{l.name.slice(0, 2).toUpperCase()}</span>;
}
