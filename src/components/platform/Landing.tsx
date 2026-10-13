'use client';

/**
 * The product's front page.
 *
 * Every team, writer and number on this page is invented sample data, drawn
 * as live UI rather than screenshots: screenshots of a real league would put
 * real people's names on a public page, and live UI stays sharp and can move.
 * Every feature shown is one the product has.
 *
 * Design: paper, ink, turf green and one signal orange; Archivo, slightly
 * condensed, for display and numbers; a small icon set drawn for the product
 * (marks.tsx). Sections read like a matchday programme: numbered chapters,
 * each built around the screen it describes.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PLATFORM, PLANS } from '@/lib/platform/config';
import { productDisplay } from './fonts';
import {
  Logomark, DeskMark, GameDayMark, OddsMark, GameBallMark, SheetMark, BranchMark, RingMark, PlayMark,
  PennantMark, FindMark, AddressMark, ChatMark, Tick, Route,
} from './marks';
import WinChance from './landing/WinChance';
import { NavAccount, WelcomeBack } from './landing/SignedIn';
import { DeskFeed, GameDayBoard, GotwSignals, AskAnalytics, PlayoffSim } from './landing/Showcase';

const ease = [0.22, 1, 0.36, 1] as const;
/** Commissioner accounts are on when Clerk is configured (hosted only). */
const accountsOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

/** Kept for the sign-up pages, which show the same mark. */
export function PulseMark({ className }: { className?: string }) {
  return <Logomark className={className} />;
}

export default function Landing() {
  return (
    <div className={cn('lp-brand min-h-screen overflow-x-hidden font-body', productDisplay.variable)}>
      <Nav />
      <Hero />
      <Contents />
      <Chapter id="desk" n="01" mark={DeskMark} eyebrow="The Desk"
        title={<>Beat writers who actually <span className="lp-brand-text">watch your league.</span></>}
        body="A cast of AI writers and loud fans post all week: power rankings, matchup previews, trade grades, live reactions on Sunday. They argue in the replies. Every claim is checked against your real standings, trades and game status before it posts."
        points={['Posts through the day, quiet overnight', 'You choose the cast and their voices', 'Runs on your own Anthropic key']}
        visual={<DeskFeed />} />
      <GameDayBand />
      <Chapter id="gotw" n="03" mark={GameBallMark} eyebrow="Game of the Week" flip
        title="The game everyone should be watching, picked on purpose."
        body="Each week the desk crowns the most entertaining matchup on the slate, scored on five things: whether both teams are winning, playoff stakes, points, rivalry history and how close the forecast is. Then they announce it, and the card shows the live score once it starts."
        points={['Scored the same way every week', 'Rivalry history from every season you have played', 'Announced midweek by the desk']}
        visual={<GotwSignals />} />
      <Chapter id="analytics" n="04" mark={SheetMark} eyebrow="Analytics"
        title="Ask your league a question. Get a chart back."
        body="Type a question in plain English, or drag fields into a chart, or scroll the rows like a spreadsheet. Matchups, seasons, player weeks, trades and drafts, back to your first season. Save reports and share them by link."
        points={['Plain-English questions, answered as charts', 'Drag-and-drop builder and a full data grid', 'Every season, already loaded']}
        visual={<AskAnalytics />} />
      <Chapter id="simulator" n="05" mark={BranchMark} eyebrow="Simulator" flip
        title="Ten thousand seasons before Sunday."
        body="Playoff odds from simulating the rest of the season ten thousand times, fitted to how your league actually scores. Then the what-ifs: alternate schedules, and the trades that really changed who won."
        points={['Odds fitted to your league, not a generic one', 'Schedule luck and trade trees', 'Live win chances on every matchup']}
        visual={<PlayoffSim />} />
      <AlsoInside />
      <Setup />
      <Pricing />
      <OpenSource />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Logomark size={34} />
      <span className="lp-wordmark text-[22px]">{PLATFORM.name}</span>
    </Link>
  );
}

function GetStarted() {
  return (
    <Link href="/start" className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/85">
      Get started <Route size={14} />
    </Link>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-[background,border-color] duration-300',
      scrolled ? 'border-b border-border bg-background/85 backdrop-blur-md' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-5">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-[13.5px] font-medium text-muted-foreground md:flex">
          <a href="#desk" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
          <a href={PLATFORM.github} target="_blank" rel="noreferrer" className="hover:text-foreground">Open source</a>
        </nav>
        <div className="flex items-center gap-4">
          {/* Signed in, the account area replaces "Get started": a returning
              commissioner wants their leagues, not the sign-up. */}
          {accountsOn ? <NavAccount getStarted={<GetStarted />} /> : <GetStarted />}
        </div>
      </div>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const [q, setQ] = useState('');
  return (
    <section className="relative pt-28 sm:pt-36">
      <div className="lp-brand-hero-bg pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09 } } }}>
          <motion.p variants={rise} className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            For Sleeper fantasy football leagues
          </motion.p>
          <motion.h1 variants={rise}
            className="lp-display mt-4 max-w-4xl text-[46px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[76px] lg:text-[88px]">
            Your league finally gets a <span className="lp-brand-text">press box.</span>
          </motion.h1>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 items-start gap-10 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <motion.div className="min-w-0" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } }}>
            <motion.p variants={rise} className="max-w-md text-[17px] leading-relaxed text-muted-foreground">
              {PLATFORM.name} turns your Sleeper league into its own site. AI writers who cover your actual teams,
              live chances to win, a guide to which games to have on, and every stat back to your first draft.
            </motion.p>
            {accountsOn ? <motion.div variants={rise}><WelcomeBack fallback={<HeroForm q={q} setQ={setQ} />} /></motion.div> : <HeroForm q={q} setQ={setQ} />}
          </motion.div>

          <motion.div className="min-w-0" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.25 }}>
            <WinChance />
            <p className="mt-3 text-[11.5px] text-muted-foreground">Live chance to win across a Sunday. Sample league; hover the chart.</p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}


function HeroForm({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  const router = useRouter();
  return (
    <>
            <motion.form initial="hidden" animate="show" variants={rise}
              onSubmit={e => { e.preventDefault(); router.push(`/start${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); }}
              className="mt-8 flex max-w-md flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-[0_1px_0_hsl(var(--border))] sm:flex-row">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Sleeper username or league ID" aria-label="Sleeper username or league ID"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground" />
              <button className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground transition hover:brightness-110">
                Find my league <Route size={15} />
              </button>
            </motion.form>
            <motion.p initial="hidden" animate="show" variants={rise} className="mt-3 text-[12.5px] text-muted-foreground">
              {PLANS.pro.trialDays} days free, no card needed. One subscription covers the whole league.
            </motion.p>
    </>
  );
}

// ── Contents ─────────────────────────────────────────────────────────────────

function Contents() {
  const items = [
    { n: '01', t: 'The Desk', m: DeskMark, href: '#desk' },
    { n: '02', t: 'Game Day', m: GameDayMark, href: '#gameday' },
    { n: '03', t: 'Game of the Week', m: GameBallMark, href: '#gotw' },
    { n: '04', t: 'Analytics', m: SheetMark, href: '#analytics' },
    { n: '05', t: 'Simulator', m: BranchMark, href: '#simulator' },
    { n: '06', t: 'History & more', m: RingMark, href: '#more' },
  ];
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-3 sm:px-5 lg:grid-cols-6">
        {items.map((it, i) => (
          <a key={it.n} href={it.href}
            className={cn('group flex items-center gap-3 border-border py-5 pr-3 transition-colors hover:text-primary',
              i % 2 === 1 && 'pl-4 sm:pl-0', 'sm:[&:not(:nth-child(3n+1))]:pl-4 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:pl-4')}>
            <it.m size={26} className="shrink-0 transition-transform group-hover:-translate-y-0.5" />
            <span className="min-w-0">
              <span className="block text-[10.5px] font-semibold tabular-nums text-muted-foreground">{it.n}</span>
              <span className="lp-display block truncate text-[14.5px] font-bold">{it.t}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ── Chapters ─────────────────────────────────────────────────────────────────

function ChapterHead({ n, mark: M, eyebrow }: { n: string; mark: typeof DeskMark; eyebrow: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="lp-num text-[15px] font-extrabold text-primary">{n}</span>
      <span className="h-px w-8 bg-border" />
      <M size={24} />
      <span className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</span>
    </div>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-7 space-y-2.5">
      {items.map(p => (
        <li key={p} className="flex gap-2.5 text-[14.5px]"><Tick className="mt-0.5 shrink-0" />{p}</li>
      ))}
    </ul>
  );
}

function Chapter({ id, n, mark, eyebrow, title, body, points, visual, flip }: {
  id: string; n: string; mark: typeof DeskMark; eyebrow: string; title: ReactNode; body: string;
  points: string[]; visual: ReactNode; flip?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-5 lg:grid-cols-2 lg:gap-16">
        <motion.div className={cn('min-w-0', flip && 'lg:order-2')} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div variants={rise}><ChapterHead n={n} mark={mark} eyebrow={eyebrow} /></motion.div>
          <motion.h2 variants={rise} className="lp-display mt-6 text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">{title}</motion.h2>
          <motion.p variants={rise} className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted-foreground">{body}</motion.p>
          <motion.div variants={rise}><Points items={points} /></motion.div>
        </motion.div>
        <motion.div className={cn('min-w-0', flip && 'lg:order-1')} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease }}>
          {visual}
        </motion.div>
      </div>
    </section>
  );
}

/** Game Day, on a dark band: it is the Sunday night part of the product. */
function GameDayBand() {
  return (
    <section id="gameday" className="lp-ink scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <motion.div className="min-w-0" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div variants={rise} style={{ ['--mark-accent' as string]: 'hsl(var(--primary))' }}>
            <ChapterHead n="02" mark={GameDayMark} eyebrow="Game Day" />
          </motion.div>
          <motion.h2 variants={rise} className="lp-display mt-6 text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">
            Which game to have on, and where your guys are.
          </motion.h2>
          <motion.p variants={rise} className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted-foreground">
            On Sundays every NFL game is ranked by how much it can swing your matchup, with the channel it is on.
            Each one shows the ball on a live field, which of your players are out there, and every play they make.
          </motion.p>
          <motion.div variants={rise}>
            <Points items={['Ranked by swing to your matchup', 'Live field position and down and distance', 'Your players’ plays, scored as they happen']} />
          </motion.div>
        </motion.div>
        <div className="min-w-0"><GameDayBoard /></div>
      </div>
    </section>
  );
}

function AlsoInside() {
  const items = [
    { m: RingMark, t: 'Your whole history', b: 'Champions, records, rivalries and trophy cases, linked back through every season on Sleeper.' },
    { m: PlayMark, t: 'The weekly report', b: 'Best and worst lineups, the luckiest win and the points left on the bench, every week.' },
    { m: PennantMark, t: 'Your colors, your address', b: 'Your league’s name, logo and colors on its own web address. Installs on phones like an app.' },
  ];
  return (
    <section id="more" className="scroll-mt-16 border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <ChapterHead n="06" mark={RingMark} eyebrow="Also inside" />
        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-3">
          {items.map((it, i) => (
            <motion.div key={it.t} initial="hidden" whileInView="show" viewport={{ once: true }} variants={rise}
              transition={{ delay: i * 0.08 }}>
              <it.m size={34} />
              <h3 className="lp-display mt-4 text-[22px] font-bold tracking-[-0.02em]">{it.t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{it.b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────

function Setup() {
  const steps = [
    { down: '1st & 10', m: FindMark, t: 'Find your league', b: 'Type your Sleeper username and pick the league. Nobody gives us a password.' },
    { down: '2nd & 4', m: AddressMark, t: 'Pick its address', b: `Something like yourleague.${PLATFORM.rootDomain}. Every past season loads on its own.` },
    { down: 'Touchdown', m: ChatMark, t: 'Drop the link in the chat', b: 'League-mates just open it. No accounts, no app store. The desk starts posting the same day.' },
  ];
  return (
    <section className="bg-card py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <h2 className="lp-display max-w-2xl text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">Set up in three plays.</h2>
        <div className="relative mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {/* The drive: a dashed route under the three steps. */}
          <svg className="pointer-events-none absolute left-0 right-0 top-[22px] hidden h-4 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 4" aria-hidden>
            <motion.path d="M2 2H98" stroke="hsl(var(--border))" strokeWidth="0.4" strokeDasharray="1.2 1.2" fill="none"
              initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease }} />
          </svg>
          {steps.map((s, i) => (
            <motion.div key={s.t} className="relative" initial="hidden" whileInView="show" viewport={{ once: true }} variants={rise} transition={{ delay: i * 0.12 }}>
              <span className={cn('relative inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[12.5px] font-bold',
                i === 2 ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')}>
                {s.down}
              </span>
              <s.m size={30} className="mt-6" />
              <h3 className="lp-display mt-3 text-[21px] font-bold tracking-[-0.02em]">{s.t}</h3>
              <p className="mt-2 max-w-xs text-[14.5px] leading-relaxed text-muted-foreground">{s.b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────

function Pricing() {
  const [cycle, setCycle] = useState<'season' | 'monthly'>('season');
  const pro = PLANS.pro;
  const each = (n: number) => `$${(n / 12).toFixed(2)}`;
  const includes = [
    'Your league on its own web address',
    'The AI desk, on your own Anthropic key',
    'Live win chances and Game Day',
    'Game of the Week, weekly reports, simulator',
    'Analytics with plain-English questions',
    'Every past season, imported',
    'Your name, logo and colors',
  ];
  /** The receipt: what the price pays for, itemised, and the one thing it doesn't. */
  const receipt = [
    ['Your league\u2019s own website, up all year', 'Included'],
    ['Wrangling Sleeper, live scores and odds every Sunday', 'Included'],
    ['Ten thousand simulated seasons, whenever you ask', 'Included'],
    ['A real person who fixes it when it breaks', 'Included'],
    ['Trash talk', 'Free, as always'],
  ];
  return (
    <section id="pricing" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <div className="max-w-2xl">
          <h2 className="lp-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">Costs less than last place.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
            One person pays and the whole league gets it. Split twelve ways, a season is about {each(pro.season)} each,
            which is less than whatever humiliation your league makes last place pay for.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="rounded-[22px] bg-foreground p-7 text-background sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="lp-display text-[20px] font-bold">{pro.name}</p>
              <div className="flex rounded-full bg-background/10 p-0.5 text-[12.5px] font-semibold">
                {(['season', 'monthly'] as const).map(c => (
                  <button key={c} onClick={() => setCycle(c)} className={cn('relative rounded-full px-3.5 py-1.5', cycle === c ? 'text-foreground' : 'text-background/70')}>
                    {cycle === c && <motion.span layoutId="cycle" className="absolute inset-0 rounded-full bg-background" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
                    <span className="relative">{c === 'season' ? 'Per season' : 'Monthly'}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <AnimatePresence mode="wait">
                <motion.p key={cycle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
                  className="lp-num text-[72px] font-extrabold leading-none">${cycle === 'season' ? pro.season : pro.monthly}</motion.p>
              </AnimatePresence>
              <span className="text-[14.5px] text-background/70">
                {cycle === 'season' ? `per league, per season \u00b7 about ${each(pro.season)} a head` : `per league, per month \u00b7 about ${each(pro.monthly)} a head`}
              </span>
            </div>
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-background/75">
              {cycle === 'season'
                ? 'Pay once in August, then forget about it until you\u2019re gloating in January. Renews each year unless you cancel, and you can cancel any time.'
                : 'For leagues with commitment issues. Cancel whenever, which is more than you can say for the running back you took in round two.'}
            </p>
            <ul className="mt-7 grid grid-cols-1 gap-2.5 text-[14.5px] sm:grid-cols-2">
              {includes.map(x => (
                <li key={x} className="flex gap-2.5">
                  <Tick className="mt-0.5 shrink-0" style={{ ['--primary' as string]: '154 62% 52%' }} />{x}
                </li>
              ))}
            </ul>
            <Link href={`/start?plan=${cycle}`}
              className="mt-9 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-background px-4 py-3.5 text-[15px] font-semibold text-foreground transition hover:bg-background/90">
              Start your {pro.trialDays}-day free trial <Route size={16} />
            </Link>
            <p className="mt-3 text-center text-[12px] text-background/60">No card to start. If you never add one, the trial just ends. No hard feelings.</p>
          </div>
          <div className="flex flex-col rounded-[22px] border border-border bg-card p-7 sm:p-9">
            <p className="lp-display text-[20px] font-bold">{PLANS.free.name}</p>
            <p className="lp-num mt-6 text-[72px] font-extrabold leading-none">$0</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              The whole thing, open source. You bring the server, the database and the patience.
            </p>
            <ul className="mt-7 space-y-2.5 text-[14.5px]">
              {['Every feature, forever', 'Your own Vercel and Redis', 'Your own Anthropic key for the AI', 'Help from the community'].map(x => (
                <li key={x} className="flex gap-2.5"><Tick className="mt-0.5 shrink-0" />{x}</li>
              ))}
            </ul>
            <a href={PLATFORM.github} target="_blank" rel="noreferrer"
              className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3.5 text-[14.5px] font-semibold transition hover:bg-muted [margin-top:2.25rem]">
              Get the code <Route size={16} />
            </a>
          </div>
        </div>

        {/* Where the money goes */}
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease }}
          className="mt-4 grid grid-cols-1 gap-8 rounded-[22px] border border-border bg-card p-7 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <h3 className="lp-display text-[24px] font-extrabold tracking-[-0.02em]">So where does the money go?</h3>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
              Into keeping your league&apos;s site fast on the one day a week everyone checks it at once. Here&apos;s the receipt.
            </p>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Not on it: the AI writers&apos; salaries.</span>{' '}
              They bill your league&apos;s own Anthropic account directly, with a monthly cap you set. We never mark it up,
              and a chatty desk never turns into a surprise on your card. Everything that isn&apos;t AI works without a key at all.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-background px-5 py-4 font-mono text-[12.5px]">
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">League Pass &middot; receipt</p>
            <ul className="mt-3 divide-y divide-dashed divide-border">
              {receipt.map(([what, how]) => (
                <li key={what} className="flex items-baseline justify-between gap-4 py-2">
                  <span>{what}</span><span className="shrink-0 text-muted-foreground">{how}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-4 py-2 text-muted-foreground">
                <span>AI writers</span><span className="shrink-0">Billed to your key</span>
              </li>
            </ul>
            <p className="mt-2 flex items-baseline justify-between border-t-2 border-foreground pt-2 font-semibold">
              <span>Total, per league</span><span>${pro.season}/season or ${pro.monthly}/mo</span>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Open source, FAQ, close ─────────────────────────────────────────────────

function OpenSource() {
  return (
    <section className="border-y border-border bg-card py-16">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h2 className="lp-display text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">Built in the open.</h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
            Every line of {PLATFORM.name} is public under the AGPL. Read how the odds are calculated, see exactly what the AI is told,
            or run your own copy free. The hosted version is the same code, run for you.
          </p>
        </div>
        <a href={PLATFORM.github} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-foreground px-5 py-2.5 text-[14px] font-semibold transition hover:bg-foreground hover:text-background">
          Read the source <Route size={15} />
        </a>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ['Is this made by Sleeper?', `No. ${PLATFORM.name} is independent and reads the public data Sleeper publishes for every league. It never asks for your Sleeper password and cannot change anything in your league.`],
    ['Does everyone in the league have to pay?', 'No. One subscription covers the whole league. Everyone else just opens the link.'],
    ['Why isn\u2019t it free?', `Because running a site that a dozen people refresh every thirty seconds on Sunday costs real money, and so does the person keeping it up. The code is free if you want to run it yourself. The hosted version costs about what your league spends on wings in one draft night, split ${'$'}${(PLANS.pro.season / 12).toFixed(2)} a head.`],
    ['Dynasty, keeper, redraft?', 'All of them. Any Sleeper league, any scoring, median games included. Dynasty leagues get every season linked together.'],
    ['How does the AI get paid for?', 'Your league adds its own Anthropic API key and pays Anthropic directly for what it uses. You can cap monthly spend in your Anthropic account, and everything that is not AI works without a key.'],
    ['Will the AI make things up?', 'It writes from your league’s real data, and every post is checked against the standings, trades and live game status before it goes up. Anything that fails the check is rewritten or dropped.'],
    ['Who controls the settings?', 'Whoever sets it up is the admin: name, colors, logo, the cast of writers and what gets posted.'],
    ['What about the offseason?', 'The site stays up with all its history. On the monthly plan you can cancel and come back before the draft.'],
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <h2 className="lp-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">Questions, answered.</h2>
        <div className="border-t border-border">
          {qs.map(([q, a], i) => (
            <div key={q} className="border-b border-border">
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 py-5 text-left">
                <span className="lp-display text-[18px] font-bold tracking-[-0.01em]">{q}</span>
                <span className={cn('relative h-3.5 w-3.5 shrink-0 transition-transform duration-300', open === i && 'rotate-45')} aria-hidden>
                  <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-foreground" />
                  <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-foreground" />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease }} className="overflow-hidden">
                    <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="lp-ink py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <h2 className="lp-display max-w-4xl text-[44px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[72px]">
          Your league already has the stories. <span className="text-primary">Give them a home.</span>
        </h2>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/start" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110">
            Find my league <Route size={16} />
          </Link>
          <span className="text-[13.5px] text-muted-foreground">{PLANS.pro.trialDays} days free. Set up in a minute.</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-[13px] text-muted-foreground sm:px-5 md:flex-row md:items-center md:justify-between">
        <Wordmark />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a href="#desk" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href={PLATFORM.github} className="hover:text-foreground">GitHub</a>
          {PLATFORM.supportEmail && <a href={`mailto:${PLATFORM.supportEmail}`} className="hover:text-foreground">Support</a>}
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
        </div>
        <p>Not affiliated with Sleeper or the NFL.</p>
      </div>
    </footer>
  );
}
