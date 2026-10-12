'use client';

/**
 * The product's front page.
 *
 * Every team, writer and number on this page is invented sample data, drawn
 * as live UI rather than screenshots. Screenshots of a real league would put
 * real people's names and handles on a public marketing page; mock UI also
 * stays sharp at any size and can move.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Check, ChevronDown, GithubIcon, Radio, Sparkles, BarChart3, Trophy, Megaphone,
  CrownIcon, FlaskConical, Database, Zap, Target, Activity,
} from '@/components/icons';
import { PLATFORM, PLANS } from '@/lib/platform/config';

// ── Sample data ──────────────────────────────────────────────────────────────

const TEAM_A = { name: 'Gridiron Ghosts', record: '6-2', color: 'from-sky-400 to-indigo-500', initials: 'GG' };
const TEAM_B = { name: 'Fourth & Long Shots', record: '5-3', color: 'from-amber-400 to-rose-500', initials: 'FL' };

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

function Monogram({ t, size = 40 }: { t: { initials: string; color: string }; size?: number }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-display font-bold text-white shadow-lg', t.color)}
      style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {t.initials}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="lp-brand min-h-screen overflow-x-hidden font-body">
      <Nav />
      <Hero />
      <Proof />
      <Features />
      <Steps />
      <Pricing />
      <OpenSource />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all',
      scrolled ? 'border-b border-border/60 bg-background/75 backdrop-blur-xl' : 'bg-transparent')}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/landing" className="flex items-center gap-2">
          <PulseMark />
          <span className="font-display text-[17px] font-bold tracking-tight">{PLATFORM.name}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13.5px] text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#open-source" className="hover:text-foreground">Open source</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
        </nav>
        <Link href="/start" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_0_24px_hsl(151_82%_50%/0.35)] transition hover:brightness-110">
          Get started <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}

/** The mark: a heartbeat line, because the product is a league's pulse. */
function PulseMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/15 ring-1 ring-primary/40', className)}>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h4l2.5-6 4 12 3-8 1.5 2H22" />
      </svg>
    </span>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <section className="relative pt-28 sm:pt-36">
      <div className="lp-brand-hero-bg pointer-events-none absolute inset-0 -z-0" />
      {/* grid-cols-1 and min-w-0: an implicit grid column sizes to its widest
          content, which pushed the hero past a phone's right edge. */}
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-5 pb-20 lg:grid-cols-[1.05fr_1fr]">
        <motion.div className="min-w-0" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.p variants={fadeUp} className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            For every Sleeper league
          </motion.p>
          <motion.h1 variants={fadeUp} className="mt-5 font-display text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
            Give your league<br />a <span className="lp-brand-text">pulse.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            A home for your fantasy league. AI beat writers who trash talk your actual roster,
            live win odds, a Sunday guide to which games to have on, and every stat since your
            first draft. Ready in a minute, from your Sleeper league.
          </motion.p>
          <motion.form variants={fadeUp}
            onSubmit={e => { e.preventDefault(); router.push(`/start${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}
            className="mt-8 flex max-w-lg flex-col gap-2 rounded-2xl border border-border bg-card/80 p-2 shadow-2xl backdrop-blur sm:flex-row">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Your Sleeper username or league ID"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground" />
            <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground transition hover:brightness-110">
              Find my league <ArrowRight className="h-4 w-4" />
            </button>
          </motion.form>
          <motion.p variants={fadeUp} className="mt-3 text-[12.5px] text-muted-foreground">
            {PLANS.pro.trialDays}-day free trial. No card to look around. Cancel any time.
          </motion.p>
        </motion.div>
        <HeroVisual />
      </div>
    </section>
  );
}

/** A matchup card whose odds tick, a feed post, and a live field. */
function HeroVisual() {
  const reduce = useReducedMotion();
  const [p, setP] = useState(0.58);
  const [ball, setBall] = useState(38);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setP(x => Math.min(0.86, Math.max(0.32, x + (Math.random() - 0.45) * 0.07)));
      setBall(b => (b >= 92 ? 30 : b + 4 + Math.random() * 10));
    }, 1800);
    return () => clearInterval(t);
  }, [reduce]);
  const a = 112.4 + (p - 0.58) * 60, b = 104.9 - (p - 0.58) * 40;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-md lg:max-w-none">
      <motion.div initial={{ opacity: 0, y: 30, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: -1.5 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="relative rounded-3xl border border-border bg-card p-5 shadow-[0_40px_120px_-30px_hsl(151_82%_50%/0.35)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <CrownIcon className="h-3.5 w-3.5" /> Game of the Week
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> Live
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Monogram t={TEAM_A} />
            <div className="min-w-0"><p className="truncate text-[13px] font-bold">{TEAM_A.name}</p><p className="text-[11px] text-muted-foreground">{TEAM_A.record}</p></div>
          </div>
          <span className="text-[10px] font-bold text-muted-foreground">VS</span>
          <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 text-right">
            <Monogram t={TEAM_B} />
            <div className="min-w-0"><p className="truncate text-[13px] font-bold">{TEAM_B.name}</p><p className="text-[11px] text-muted-foreground">{TEAM_B.record}</p></div>
          </div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div><p className="font-display text-[34px] font-bold leading-none tabular-nums">{a.toFixed(1)}</p><p className="mt-1 text-[11px] font-semibold text-primary tabular-nums">{Math.round(p * 100)}% to win</p></div>
          <div className="text-right"><p className="font-display text-[26px] font-bold leading-none text-muted-foreground tabular-nums">{b.toFixed(1)}</p><p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{Math.round((1 - p) * 100)}%</p></div>
        </div>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/70 to-primary" animate={{ width: `${p * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
        </div>
        {/* Field */}
        <div className="mt-5">
          <div className="flex justify-between text-[10.5px] font-semibold text-muted-foreground"><span>KC ball · your WR</span><span>2nd &amp; 6</span></div>
          <div className="relative mt-1.5 h-7 overflow-hidden rounded-md bg-emerald-500/[0.12] ring-1 ring-inset ring-emerald-500/20">
            <div className="absolute inset-y-0 right-0 w-[6%] bg-primary/25" />
            <div className="absolute inset-y-0 right-[6%] w-[17.6%] bg-red-500/10" />
            {Array.from({ length: 9 }, (_, i) => <div key={i} className="absolute inset-y-0 w-px bg-foreground/10" style={{ left: `${6 + (i + 1) * 8.8}%` }} />)}
            <motion.div className="absolute top-1/2 h-3.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-amber-600 ring-2 ring-card" animate={{ left: `${6 + Math.min(ball, 94) * 0.88}%` }} transition={{ type: 'spring', stiffness: 70, damping: 15 }} />
          </div>
        </div>
      </motion.div>

      {/* Feed post */}
      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.5 }}
        className="relative -mt-6 ml-auto w-[88%] rotate-[1.5deg] rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-[11px] font-bold text-white">DC</span>
          <div className="min-w-0 flex-1"><p className="text-[13px] font-bold">Dana Cole <span className="font-normal text-muted-foreground">@thecolecall</span></p></div>
          <span className="text-[11px] text-muted-foreground">2m</span>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed">
          Fourth &amp; Long Shots traded away their RB1 for &ldquo;depth&rdquo; and are now starting a fullback. Bold. Wrong, but bold.
        </p>
        <div className="mt-2 flex items-center gap-4 text-[11.5px] text-muted-foreground"><span>♥ 24</span><span>3 replies</span>
          <span className="ml-auto inline-flex items-center gap-1 text-primary"><span className="flex gap-0.5"><span className="h-1 w-1 animate-bounce rounded-full bg-primary" /><span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:120ms]" /><span className="h-1 w-1 animate-bounce rounded-full bg-primary [animation-delay:240ms]" /></span> replying</span>
        </div>
      </motion.div>
      <p className="mt-4 text-center text-[11px] text-muted-foreground/70">Sample league. Yours will be full of your own teams.</p>
    </div>
  );
}

function Proof() {
  const items = [
    ['Any Sleeper league', 'Paste a username or a league ID'],
    ['Every season', 'Linked back to your first draft'],
    ['Live on Sundays', 'Scores, odds and plays as they happen'],
    ['Open source', 'Read every line, or run it yourself'],
  ];
  return (
    <section className="border-y border-border/60 bg-card/30">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4">
        {items.map(([t, s]) => (
          <div key={t}><p className="font-display text-[15px] font-bold">{t}</p><p className="mt-0.5 text-[12.5px] text-muted-foreground">{s}</p></div>
        ))}
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: ReactNode; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="max-w-2xl">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">{title}</h2>
          {sub && <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
        </motion.div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: I, title, body, visual, wide }: {
  icon: typeof Sparkles; title: string; body: string; visual?: ReactNode; wide?: boolean;
}) {
  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={fadeUp}
      className={cn('group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition-colors hover:border-primary/40', wide && 'md:col-span-2')}>
      <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
      <span className="lp-chip h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5"><I /></span>
      <h3 className="mt-4 font-display text-[20px] font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
      {visual && <div className="mt-5">{visual}</div>}
    </motion.div>
  );
}

function Features() {
  return (
    <Section id="features" eyebrow="What you get" title={<>Everything your group chat argues about, <span className="lp-brand-text">in one place.</span></>}
      sub="Built on your league's real Sleeper history: every matchup, trade, waiver claim and draft pick, across every season you have played.">
      <div className="grid gap-4 md:grid-cols-3">
        <FeatureCard wide icon={Megaphone} title="An AI media desk that knows your league"
          body="A cast of beat writers and loud fans post takes, power rankings, previews and live reactions all week, and argue in the replies. Every claim is checked against your real standings, trades and game status before it posts."
          visual={<FeedVisual />} />
        <FeatureCard icon={Radio} title="Game Day"
          body="Which NFL games to have on, ranked by how much each one swings your matchup, with the channel, the ball on a live field, and every play your players make."
          visual={<GameDayVisual />} />
        <FeatureCard icon={Target} title="Live win odds"
          body="A calibrated forecast on every matchup, fitted to your league's own scoring, updating as players take the field." />
        <FeatureCard icon={CrownIcon} title="Game of the Week"
          body="The most entertaining matchup on the slate, picked from records, rivalries and playoff stakes, then announced by the desk." />
        <FeatureCard icon={BarChart3} title="Analytics anyone can use"
          body="Ask a question in plain English, drag fields into a chart, or dig through the rows in a spreadsheet. Save reports and share them by link." />
        <FeatureCard wide icon={FlaskConical} title="Simulator and what-ifs"
          body="Ten thousand simulated seasons for playoff odds, alternate schedules, and the trades that actually changed who won."
          visual={<OddsVisual />} />
        <FeatureCard icon={Database} title="Your whole history"
          body="Records, rivalries, champions and trophy cases, linked back through every season you have played on Sleeper." />
        <FeatureCard icon={Activity} title="Weekly report"
          body="A recap of the week just played: best and worst lineups, the luckiest win, the points left on the bench." />
        <FeatureCard wide icon={Sparkles} title="Make it yours"
          body="Your league's name, logo and colours, light and dark, on its own web address. Installs on phones like an app." />
      </div>
    </Section>
  );
}

function FeedVisual() {
  const posts = [
    { who: 'Dana Cole', tag: 'Power Rankings', text: 'Gridiron Ghosts at No. 1 and I will not be taking questions.', c: 'from-fuchsia-500 to-violet-600' },
    { who: 'Big Mike', tag: 'Fan', text: 'Ranking a 6-2 team first is not analysis, Dana, it is reading.', c: 'from-orange-400 to-red-500' },
  ];
  return (
    <div className="space-y-2">
      {posts.map((p, i) => (
        <div key={p.who} className={cn('flex gap-3 rounded-2xl border border-border bg-background/60 p-3', i === 1 && 'ml-8')}>
          <span className={cn('h-8 w-8 shrink-0 rounded-full bg-gradient-to-br', p.c)} />
          <div className="min-w-0 text-[13px]">
            <p className="font-bold">{p.who} <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">{p.tag}</span></p>
            <p className="mt-0.5 text-muted-foreground">{p.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function GameDayVisual() {
  const games = [['MIN @ NO', 'FOX', '±28%', 0.95], ['DEN @ LAC', 'CBS', '±21%', 0.72], ['BUF @ LAR', 'ESPN', '±17%', 0.58]] as const;
  return (
    <div className="space-y-2">
      {games.map(([g, tv, s, w]) => (
        <div key={g} className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-[12.5px]">
          <span className="font-bold">{g}</span>
          <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold">{tv}</span>
          <span className="ml-auto font-display font-bold tabular-nums">{s}</span>
          <span className="h-1 w-12 overflow-hidden rounded-full bg-foreground/10"><span className="block h-full rounded-full bg-primary" style={{ width: `${w * 100}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

function OddsVisual() {
  const teams = [['Gridiron Ghosts', 0.94], ['Fourth & Long Shots', 0.71], ['The Waiver Wire', 0.48], ['Bench Mob', 0.22], ['Punt Intended', 0.09]] as const;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {teams.map(([t, p], i) => (
        <div key={t} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-36 truncate">{t}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <motion.span className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
              initial={{ width: 0 }} whileInView={{ width: `${p * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.08 }} />
          </span>
          <span className="w-9 text-right font-semibold tabular-nums">{Math.round(p * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────

function Steps() {
  const steps = [
    { icon: Zap, t: 'Find your league', b: 'Type your Sleeper username. We list your leagues; pick one. Nobody has to give us a password.' },
    { icon: Target, t: 'Pick an address', b: `Choose where it lives, like yourleague.${PLATFORM.rootDomain}. History back to your first season loads on its own.` },
    { icon: Trophy, t: 'Drop the link in the chat', b: 'Your league-mates just open it. No accounts, no app store. The desk starts posting the same day.' },
  ];
  return (
    <Section eyebrow="Set up in a minute" title="Three steps. No spreadsheets.">
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div key={s.t} initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
            className="relative rounded-3xl border border-border bg-card p-6">
            <span className="font-display text-[56px] font-bold leading-none text-foreground/[0.06]">{i + 1}</span>
            <span className="lp-chip absolute right-6 top-6 h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5"><s.icon /></span>
            <h3 className="mt-2 font-display text-[19px] font-bold">{s.t}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{s.b}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────

function Pricing() {
  const [cycle, setCycle] = useState<'season' | 'monthly'>('season');
  const pro = PLANS.pro;
  const includes = [
    'Your league on its own web address',
    'The AI media desk, on your own Anthropic key',
    'Live win odds and Game Day',
    'Game of the Week, weekly reports, simulator',
    'Self-serve analytics with AI questions',
    'Every past season, imported',
    'Your name, logo and colours',
  ];
  return (
    <Section id="pricing" eyebrow="Pricing" title="One price for the whole league."
      sub="One person subscribes and everyone in the league gets it. Split across a twelve-team league, it is about a dollar each a month.">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-border bg-card p-7">
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{PLANS.free.name}</p>
          <p className="mt-3 font-display text-[44px] font-bold leading-none">Free</p>
          <p className="mt-3 text-[14px] text-muted-foreground">{PLANS.free.blurb}</p>
          <ul className="mt-6 space-y-2.5 text-[14px]">
            {['Every feature, forever', 'Your own Vercel and Redis', 'Bring your own Anthropic key for the AI', 'Community support'].map(x => (
              <li key={x} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{x}</li>
            ))}
          </ul>
          <a href={PLATFORM.github} target="_blank" rel="noreferrer"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-[14px] font-semibold hover:bg-muted">
            <GithubIcon className="h-4 w-4" /> View on GitHub
          </a>
        </div>

        <div className="lp-spotlight relative rounded-3xl bg-card p-7 shadow-[0_30px_100px_-40px_hsl(151_82%_50%/0.5)]">
          <div className="relative z-[2]">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-primary">{pro.name}</p>
              <div className="flex rounded-full border border-border bg-background/60 p-0.5 text-[12px] font-semibold">
                {(['season', 'monthly'] as const).map(c => (
                  <button key={c} onClick={() => setCycle(c)}
                    className={cn('relative rounded-full px-3 py-1', cycle === c ? 'text-primary-foreground' : 'text-muted-foreground')}>
                    {cycle === c && <motion.span layoutId="cycle" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
                    <span className="relative">{c === 'season' ? 'Per season' : 'Monthly'}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <AnimatePresence mode="wait">
                <motion.p key={cycle} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="font-display text-[56px] font-bold leading-none tracking-[-0.03em]">
                  ${cycle === 'season' ? pro.season : pro.monthly}
                </motion.p>
              </AnimatePresence>
              <span className="text-[15px] text-muted-foreground">{cycle === 'season' ? 'per league, per season' : 'per league, per month'}</span>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {cycle === 'season'
                ? `One payment for the whole season, about $${(pro.season / 5).toFixed(0)} a month over five months.`
                : 'Cancel whenever. Most leagues pause it in the offseason.'}
            </p>
            <ul className="mt-6 grid gap-2.5 text-[14px] sm:grid-cols-2">
              {includes.map(x => <li key={x} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{x}</li>)}
            </ul>
            <Link href={`/start?plan=${cycle}`}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110">
              Start your {pro.trialDays}-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

function OpenSource() {
  return (
    <section id="open-source" className="scroll-mt-20 py-10">
      <div className="mx-auto max-w-6xl px-5">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card to-background p-8 sm:p-12">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-primary">Open source</p>
              <h2 className="mt-3 font-display text-[30px] font-bold leading-tight tracking-[-0.03em] sm:text-[38px]">Built in the open.</h2>
              <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-muted-foreground">
                Every line of {PLATFORM.name} is public. Read how the odds are calculated, see exactly what the AI is told,
                or run your own copy for free. The hosted version is the same code, run for you.
              </p>
            </div>
            <a href={PLATFORM.github} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-5 py-3 text-[14px] font-semibold hover:border-primary/50">
              <GithubIcon className="h-5 w-5" /> Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ['Is this made by Sleeper?', `No. ${PLATFORM.name} is independent and reads the public data Sleeper publishes for every league. It never asks for your Sleeper password and cannot change anything in your league.`],
    ['Does everyone in the league have to pay?', 'No. One subscription covers the whole league. Everyone else just opens the link.'],
    ['Does it work for dynasty, keeper and redraft?', 'Yes. Any Sleeper league, any scoring, median games included. Dynasty leagues get every season linked together.'],
    ['Who can change the settings?', 'Whoever sets it up is the admin. Admins choose the name, colours and logo, the cast of AI writers, and what gets posted.'],
    ['How does the AI get paid for?', 'Your league plugs in its own Anthropic API key and pays Anthropic directly for what it uses, typically $5 to $10 a month for a league. You can set a monthly spending cap in your Anthropic account, and everything that is not AI works without a key at all.'],
    ['Is the AI going to make things up?', 'It writes from your league’s real data, and every post is checked against the standings, trades and live game status before it goes up. Anything that fails is rewritten or dropped.'],
    ['What happens in the offseason?', 'Your site stays up with all its history. On the monthly plan you can pause and pick back up before the draft.'],
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" eyebrow="Questions" title="Good questions.">
      <div className="mx-auto max-w-3xl divide-y divide-border rounded-3xl border border-border bg-card">
        {qs.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
              <span className="font-display text-[16.5px] font-bold">{q}</span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open === i && 'rotate-180 text-primary')} />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="px-6 pb-5 text-[14.5px] leading-relaxed text-muted-foreground">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-5 text-center">
        <PulseMark className="mx-auto h-12 w-12 rounded-2xl [&>svg]:h-7 [&>svg]:w-7" />
        <h2 className="mt-6 font-display text-[38px] font-bold leading-tight tracking-[-0.03em] sm:text-[52px]">
          Your league already has the stories.<br /><span className="lp-brand-text">Give them a home.</span>
        </h2>
        <Link href="/start" className="mt-9 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-[0_0_40px_hsl(151_82%_50%/0.35)] transition hover:brightness-110">
          Find my league <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><PulseMark className="h-7 w-7" /><span className="font-display font-bold text-foreground">{PLATFORM.name}</span></div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href={PLATFORM.github} className="hover:text-foreground">GitHub</a>
          {PLATFORM.supportEmail && <a href={`mailto:${PLATFORM.supportEmail}`} className="hover:text-foreground">Support</a>}
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
        </div>
        <p>Not affiliated with Sleeper. Uses Sleeper&apos;s public API.</p>
      </div>
    </footer>
  );
}

// The sign-up flow uses the same mark.
export { PulseMark };
