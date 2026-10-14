'use client';

/**
 * Sign-up: find your league, pick an address, start the trial.
 *
 * Three steps on one page, each sliding in once the one before it is done,
 * so the whole flow is visible as it fills in rather than a wizard that hides
 * where you are.
 *
 * Sleeper or ESPN. A Sleeper league is found by username or league id, with
 * no login. An ESPN league by its id or league page URL; most are private,
 * and those need two of the commissioner's (or any member's) ESPN cookies,
 * asked for only once ESPN has said the league is private.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowRight, Check, Search, AlertTriangle, ExternalLink } from '@/components/icons';
import { PLATFORM, PLANS, slugify, type Tier } from '@/lib/platform/config';
import { Lockup } from './marks';
import { productDisplay } from './fonts';

interface FoundLeague {
  leagueId: string; name: string; season: string; avatar: string | null;
  teams: number; format: string; scoring: string; status: string; hostedAt: string | null;
}

const avatarUrl = (id: string | null) => (id ? `https://sleepercdn.com/avatars/thumbs/${id}` : null);

type Provider = 'sleeper' | 'espn';

/** Back from a cancelled checkout: `league=espn-123-2026` means the ESPN league 123. */
const espnIdOf = (v: string | null) => /^espn-(\d+)-\d{4}$/.exec(v ?? '')?.[1] ?? null;

export default function Onboarding() {
  const params = useSearchParams();
  const [provider, setProvider] = useState<Provider>(
    params.get('provider') === 'espn' || espnIdOf(params.get('league')) ? 'espn' : 'sleeper');
  const [q, setQ] = useState(params.get('q') ?? espnIdOf(params.get('league')) ?? '');
  const [needsCookies, setNeedsCookies] = useState(false);
  const [swid, setSwid] = useState('');
  const [s2, setS2] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ user: { name: string } | null; leagues: FoundLeague[] } | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [league, setLeague] = useState<FoundLeague | null>(null);
  const [slug, setSlug] = useState(params.get('slug') ?? '');
  const [slugState, setSlugState] = useState<{ ok: boolean; reason?: string; slug: string } | null>(null);
  const [plan, setPlan] = useState<'season' | 'monthly'>(params.get('plan') === 'monthly' ? 'monthly' : 'season');
  // League Pass, or League Pass + AI (we run the AI). Arrives from the pricing page's choice.
  const [tier, setTier] = useState<Tier>(params.get('tier') === 'ai' ? 'ai' : 'standard');
  const [email, setEmail] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<{ msg: string; missing?: string[] } | null>(null);
  // The operator's own account makes leagues free, without a checkout.
  const [operator, setOperator] = useState(false);
  useEffect(() => {
    fetch('/api/platform/operator/me').then(r => r.json()).then(d => setOperator(Boolean(d?.operator))).catch(() => {});
  }, []);

  const find = async (value: string, as: Provider = provider) => {
    const v = value.trim();
    if (!v) return;
    setSearching(true); setFindError(null); setFound(null); setLeague(null);
    try {
      const r = as === 'espn'
        ? await fetch('/api/platform/espn/lookup', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ q: v, swid: swid.trim() || undefined, s2: s2.trim() || undefined }),
          })
        : await fetch(`/api/platform/lookup?q=${encodeURIComponent(v)}`);
      const d = await r.json();
      if (as === 'espn' && d.needsCredentials) {
        setNeedsCookies(true);
        // A private league is not an error: the cookie panel explains it.
        // Cookies ESPN turned down are.
        if (!swid.trim() && !s2.trim()) return;
      }
      if (!r.ok) throw new Error(d.error ?? 'Could not look that up');
      // Kept server side (encrypted); no need to hold them in the page.
      if (as === 'espn') { setSwid(''); setS2(''); }
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
    const initial = params.get('q') ?? espnIdOf(params.get('league')) ?? params.get('league');
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
        body: JSON.stringify({ leagueId: league.leagueId, slug: clean, plan, tier, email }),
      });
      const d = await r.json();
      if (d.url) { window.location.href = d.url; return; }
      // Accounts on: sign in (or create one) first, then come straight back
      // to this league, address and plan.
      if (r.status === 401 && d.signIn) {
        const back = `/start?league=${league.leagueId}&slug=${encodeURIComponent(clean)}&plan=${plan}&tier=${tier}`;
        window.location.href = `${d.signIn}?redirect_url=${encodeURIComponent(back)}`;
        return;
      }
      setStartError({ msg: d.error ?? 'Could not start checkout', missing: d.missing });
    } catch {
      setStartError({ msg: 'Could not reach the server' });
    } finally {
      setStarting(false);
    }
  };

  const step = !league ? 1 : !slugState?.ok ? 2 : 3;

  return (
    <div className={`lp-brand min-h-screen font-body ${productDisplay.variable}`}>
      <div className="lp-brand-hero-bg pointer-events-none fixed inset-0 opacity-60" />
      <header className="relative mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Link href="/landing" className="flex items-center gap-2">
          <Lockup size={30} text={21} />
        </Link>
        <Steps step={step} />
      </header>

      <main className="relative mx-auto max-w-3xl space-y-5 px-5 pb-24 pt-8">
        <div>
          <h1 className="lp-display text-[36px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[46px]">Let&apos;s find your league.</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {provider === 'espn'
              ? 'Paste your ESPN league ID, or the address of your league page on ESPN.'
              : 'Your Sleeper username lists your leagues. Or paste a league ID from the league’s settings.'}
          </p>
        </div>

        {/* 1. Find */}
        <Card n={1} title="Find your league" done={!!league}>
          <div role="tablist" aria-label="Where your league is" className="mb-4 inline-flex rounded-full border border-border bg-background/70 p-1 text-[13px] font-semibold">
            {(['sleeper', 'espn'] as const).map(p => (
              <button key={p} role="tab" aria-selected={provider === p} type="button"
                onClick={() => { if (p === provider) return; setProvider(p); setQ(''); setFound(null); setLeague(null); setFindError(null); setNeedsCookies(false); }}
                className={cn('relative rounded-full px-4 py-1.5 transition', provider === p ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {provider === p && <motion.span layoutId="provider-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className="relative">{p === 'espn' ? 'ESPN' : 'Sleeper'}</span>
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); find(q); }} className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus
                placeholder={provider === 'espn' ? 'ESPN league ID or league page URL' : 'Sleeper username or league ID'}
                className="w-full rounded-xl border border-border bg-background/70 py-3 pl-10 pr-3 text-[15px] outline-none focus:border-primary/60" />
            </label>
            <button disabled={searching || !q.trim()}
              className="rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {searching ? 'Looking' : 'Find'}
            </button>
          </form>
          {findError && <p className="mt-3 flex items-center gap-2 text-[13px] text-red-600"><AlertTriangle className="h-4 w-4" />{findError}</p>}
          <AnimatePresence>
            {provider === 'espn' && needsCookies && !league && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <EspnCookies swid={swid} s2={s2} setSwid={setSwid} setS2={setS2} busy={searching} onSubmit={() => find(q)} />
              </motion.div>
            )}
          </AnimatePresence>
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
                    <span className="block text-[12px] text-muted-foreground">{l.teams} teams, {l.format}, {l.scoring}, {l.season}</span>
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
                <p className={cn('mt-2 text-[12.5px]', slugState?.ok ? 'text-primary' : slugState ? 'text-red-600' : 'text-muted-foreground')}>
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
              <Card n={3} title={operator ? 'Create your league' : 'Start your free trial'}>
                {/* The tier: who runs the AI. */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['standard', 'ai'] as const).map(id => {
                    const p = id === 'ai' ? PLANS.ai : PLANS.pro;
                    const price = plan === 'season' ? p.season : p.monthly;
                    return (
                      <button key={id} onClick={() => setTier(id)} aria-pressed={tier === id}
                        className={cn('relative rounded-2xl border p-4 text-left transition', tier === id ? 'border-primary bg-primary/10' : 'border-border bg-background/50 hover:border-primary/40')}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-bold">{p.name}</span>
                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', tier === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                            {tier === id && <Check className="h-3 w-3" />}
                          </span>
                        </span>
                        {!operator && (
                          <span className="mt-2 block font-display text-[28px] font-bold leading-none">
                            ${price}<span className="ml-1 text-[12.5px] font-normal text-muted-foreground">{plan === 'season' ? 'per season' : 'per month'}</span>
                          </span>
                        )}
                        <span className="mt-2 block text-[12.5px] leading-snug text-muted-foreground">
                          {id === 'ai' ? 'We run the AI writers. Nothing to set up, no second bill.' : 'The AI runs on your own Anthropic key. You pay Anthropic for what you use, with a cap you set.'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!operator && (<>
                {/* The billing cycle. */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div role="radiogroup" aria-label="Billing" className="inline-flex rounded-full border border-border bg-background/70 p-1 text-[12.5px] font-semibold">
                    {(['season', 'monthly'] as const).map(c => (
                      <button key={c} role="radio" aria-checked={plan === c} onClick={() => setPlan(c)}
                        className={cn('relative rounded-full px-3.5 py-1.5 transition', plan === c ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                        {plan === c && <motion.span layoutId="cycle-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                        <span className="relative">{c === 'season' ? 'Per season' : 'Monthly'}</span>
                      </button>
                    ))}
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {plan === 'season' ? `About $${((tier === 'ai' ? PLANS.ai : PLANS.pro).season / 12).toFixed(2)} a head for 12 teams` : 'Cancel whenever'}
                  </span>
                </div>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email for receipts (optional)"
                  className="mt-3 w-full rounded-xl border border-border bg-background/70 px-3 py-3 text-[14.5px] outline-none focus:border-primary/60" />
                </>)}
                <button onClick={start} disabled={starting}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
                  {operator
                    ? (starting ? 'Creating' : 'Create it free')
                    : (starting ? 'Opening checkout' : `Start ${PLANS.pro.trialDays} days free`)} <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-2 text-center text-[12px] text-muted-foreground">
                  {operator
                    ? 'Operator account: no checkout. It goes straight into My leagues.'
                    : 'No card needed for the trial. If you don’t add one, it simply ends.'}
                </p>
                <p className="mt-1 text-center text-[11.5px] text-muted-foreground">
                  By continuing you agree to the <a href="/legal/terms" target="_blank" className="underline hover:text-foreground">Terms</a> and{' '}
                  <a href="/legal/privacy" target="_blank" className="underline hover:text-foreground">Privacy Policy</a>.
                </p>
                {startError && (
                  <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[13px]">
                    <p className="font-semibold text-amber-800">{startError.msg}</p>
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

/**
 * The two ESPN cookies a private league needs, and how to find them. Asked
 * for only after ESPN has said the league is private.
 */
function EspnCookies({ swid, s2, setSwid, setS2, busy, onSubmit }: {
  swid: string; s2: string; setSwid: (v: string) => void; setS2: (v: string) => void; busy: boolean; onSubmit: () => void;
}) {
  const steps = [
    <>On a computer, sign in at <a href="https://fantasy.espn.com/football/" target="_blank" rel="noopener noreferrer" className="font-semibold underline">fantasy.espn.com</a> with any account in the league.</>,
    <>Open your browser&apos;s developer tools (<b>Chrome</b> and <b>Edge</b>: right-click the page, <b>Inspect</b>), then <b>Application</b> (Firefox and Safari: <b>Storage</b>), <b>Cookies</b>, <b>https://fantasy.espn.com</b>.</>,
    <>Copy the values of <b>SWID</b> and <b>espn_s2</b> into the boxes below.</>,
  ];
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(); }} className="mt-4 rounded-2xl border border-primary/30 bg-primary/[0.05] p-4 sm:p-5">
      <p className="font-display text-[15.5px] font-bold">Your league is private on ESPN</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        ESPN has no sign-in button for other sites, so private leagues are read with two cookies from a browser that is signed in to ESPN.
      </p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug [&_b]:font-semibold">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID  {XXXXXXXX-XXXX-…}" autoComplete="off" spellCheck={false}
          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 font-mono text-[12.5px] outline-none focus:border-primary/60" />
        <input value={s2} onChange={e => setS2(e.target.value)} placeholder="espn_s2  AEB…" autoComplete="off" spellCheck={false}
          className="w-full rounded-xl border border-border bg-background/80 px-3 py-2.5 font-mono text-[12.5px] outline-none focus:border-primary/60" />
      </div>
      <button disabled={busy || !swid.trim() || !s2.trim()}
        className="mt-3 w-full rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
        {busy ? 'Checking with ESPN' : 'Connect league'}
      </button>
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
        We only use them to read your league. They&apos;re stored encrypted, never shown again, and deleted after two days if you don&apos;t start a site.
        ESPN signs them out after about a year; your league&apos;s admin page asks for new ones when that happens.
      </p>
    </form>
  );
}
