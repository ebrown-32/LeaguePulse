'use client';

/**
 * The product's front page.
 *
 * Every team, writer and number on this page is invented sample data, drawn
 * as live UI rather than screenshots: screenshots of a real league would put
 * real people's names on a public page, and live UI stays sharp and can move.
 * Every feature shown is one the product has. The exceptions: Featured
 * leagues (landing/Featured.tsx), real sites, linked, with screenshots
 * cropped to show no one's name; and the hero's trailer (landing/Trailer.tsx),
 * filmed in the app with every team, manager and photo replaced.
 *
 * Design: paper, ink, turf green and one signal orange; Archivo, slightly
 * condensed, for display and numbers; a small icon set drawn for the product
 * (marks.tsx). Sections read like a matchday programme: numbered chapters,
 * each built around the screen it describes.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { lockScroll } from '@/lib/scrollLock';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PLATFORM, PLANS } from '@/lib/platform/config';
import { productDisplay } from './fonts';
import {
  Logomark, Lockup, PhoneMark, DeskMark, GameDayMark, OddsMark, GameBallMark, SheetMark, BranchMark, RingMark, PlayMark,
  PennantMark, StadiumMark, FindMark, AddressMark, ChatMark, Tick, Route,
  BracketMark, VersusMark, RadarMark, CharterMark, QuillMark,
} from './marks';
import Stadiums from './landing/Stadiums';
import Trailer from './landing/Trailer';
import InstallApp from './landing/InstallApp';
import InquirySheet from './landing/Inquiry';
import FeaturedLeagues from './landing/Featured';
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
    <div className={cn('lp-brand min-h-screen overflow-x-clip font-body', productDisplay.variable)}>
      <Nav />
      <Hero />
      <Ticker />
      <Contents />
      <Chapter id="desk" n="01" mark={DeskMark} eyebrow="The Desk"
        title={<>Beat writers who actually <span className="lp-brand-text">watch your league.</span></>}
        body="A cast of AI writers and loud fans post all week: power rankings, matchup previews, trade grades, live reactions on Sunday. They argue in the replies. Every claim is checked against your real standings, trades and game status before it posts."
        points={['Posts through the day, quiet overnight', 'You choose the cast and their voices', 'Your own AI key, or ours with League Pass + AI']}
        visual={<DeskFeed />} />
      <GameDayBand />
      <InstallBand />
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
      <FranchiseBand />
      <AlsoInside />
      <Setup />
      <FeaturedLeagues />
      <Pricing />
      <OpenSource />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────

/** On the home page, the logo glides back to the top instead of reloading it. */
function toTop(e: React.MouseEvent, after?: () => void) {
  if (window.location.pathname !== '/' && window.location.pathname !== '/landing') return;
  e.preventDefault();
  after?.();
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // After the menu has had a moment to release the page's scroll lock.
  setTimeout(() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }), after ? 60 : 0);
  history.replaceState(null, '', window.location.pathname);
}

function Wordmark({ onHome }: { onHome?: () => void }) {
  return (
    <Link href="/" onClick={e => toTop(e, onHome)} className="flex items-center gap-2.5" aria-label={`${PLATFORM.name}, back to top`}>
      <Lockup size={34} text={22} />
    </Link>
  );
}

function GetStarted() {
  return (
    <Link href="/start" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-3.5 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/85 sm:px-4">
      <span className="sm:hidden">Start</span><span className="hidden sm:inline">Get started</span> <Route size={14} />
    </Link>
  );
}

/**
 * The live demo league (lib/demo): demo.<root domain>, or NEXT_PUBLIC_LP_DEMO_URL when set; on
 * a local server, the demo on the same port.
 */
function useDemoUrl(): string {
  const [url, setUrl] = useState(PLATFORM.demoUrl || `https://demo.${PLATFORM.rootDomain}`);
  useEffect(() => {
    const { hostname, port } = window.location;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) setUrl(`http://demo.localhost${port ? `:${port}` : ''}`);
  }, []);
  return url;
}

/** The nav's way into the demo, beside "Get started": a plain link, in a new tab. */
function DemoLink() {
  const url = useDemoUrl();
  return (
    <a href={url} target="_blank" rel="noopener"
      className="hidden items-center gap-1.5 whitespace-nowrap px-2 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground md:inline-flex">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Live demo
    </a>
  );
}

/** The phone menu's way into the demo, in a new tab, above the trial. */
function DemoMenuLink() {
  const url = useDemoUrl();
  return (
    <a href={url} target="_blank" rel="noopener"
      className="mb-2.5 flex items-center justify-center gap-2 rounded-2xl border border-border py-3.5 text-[15px] font-semibold active:bg-muted">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Try the live demo
    </a>
  );
}

/** Under the hero's form: the demo league, to click around in before signing up. */
function DemoInvite() {
  const url = useDemoUrl();
  return (
    <a href={url} target="_blank" rel="noopener" className="group mt-4 flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 pr-4 transition hover:border-primary/40 hover:bg-card">
      <span className="flex -space-x-2">
        {['priya', 'rosa', 'gus'].map(k => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={`/demo/teams/${k}.svg`} alt="" width={32} height={32} className="h-8 w-8 rounded-full ring-2 ring-card" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-foreground">Explore the live demo league</span>
        <span className="block truncate text-[12px] text-muted-foreground">Ten made-up managers, real NFL games, scored live. No sign-up.</span>
      </span>
      <Route size={16} />
    </a>
  );
}

/**
 * The sections the nav links to, in page order: the few that sell it, so the bar stays calm. The
 * rest (the app, featured leagues, questions) are a scroll away and in the phone menu.
 */
const NAV_LINKS = [
  { label: 'The Desk', href: '#desk' }, { label: 'Game Day', href: '#gameday' },
  { label: 'Analytics', href: '#analytics' }, { label: 'Stadiums', href: '#franchise' }, { label: 'Pricing', href: '#pricing' },
];

/** Which of the nav's sections is on screen. */
function useActiveSection(hrefs: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = hrefs.map(h => document.querySelector(h)).filter((e): e is Element => Boolean(e));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`);
    }, { rootMargin: '-40% 0px -55% 0px' });
    els.forEach(e => io.observe(e));
    const top = () => { if (window.scrollY < 300) setActive(null); };
    window.addEventListener('scroll', top, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', top); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return active;
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const active = useActiveSection(NAV_LINKS.map(l => l.href));
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  // The open menu covers the page: the page underneath stays put, and Escape closes it.
  useEffect(() => {
    if (!open) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <>
      <ScrollProgress />
      {/* Phones: a full-width bar. From md up: a glass pill floating below the top edge. */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 md:top-4 md:px-5">
        <motion.div
          initial={false}
          animate={{ maxWidth: scrolled ? 1040 : 1152 }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
          className={cn('pointer-events-auto mx-auto flex h-16 items-center justify-between gap-3 px-4 transition-[background-color,border-color,box-shadow,color] duration-500',
            'md:h-[60px] md:rounded-full md:border md:pl-5 md:pr-2',
            open ? 'lp-ink border-b border-transparent bg-background'
              : scrolled
                ? 'border-b border-border bg-background/85 backdrop-blur-xl md:border-border md:bg-card/75 md:shadow-[0_10px_40px_-14px_hsl(var(--foreground)/0.28)]'
                : 'border-b border-transparent md:border-border/70 md:bg-card/55 md:backdrop-blur-xl md:shadow-[0_6px_30px_-18px_hsl(var(--foreground)/0.25)]')}>
          <Wordmark onHome={() => setOpen(false)} />
          <nav className="relative hidden items-center lg:flex" onPointerLeave={() => setHover(null)}>
            {NAV_LINKS.map(l => {
              const on = active === l.href;
              return (
                <a key={l.href} href={l.href} onPointerEnter={() => setHover(l.href)}
                  className={cn('relative whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] font-semibold transition-colors duration-200 xl:px-3.5 xl:text-[13.5px]',
                    on ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
                  {hover === l.href && !on && (
                    <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-full bg-foreground/[0.07]"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                  )}
                  {on && (
                    <motion.span layoutId="nav-active" className="absolute inset-0 rounded-full bg-foreground shadow-[0_4px_14px_-4px_hsl(var(--foreground)/0.5)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                  )}
                  <span className="relative">{l.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Signed in, the account area replaces "Get started": a returning
                commissioner wants their leagues, not the sign-up. */}
            <div className={cn('transition-opacity duration-300', open && 'pointer-events-none opacity-0')}>
              <span className="flex items-center gap-3">
                <DemoLink />
                {accountsOn ? <NavAccount getStarted={<GetStarted />} /> : <GetStarted />}
              </span>
            </div>
            <MenuButton open={open} onClick={() => setOpen(o => !o)} />
          </div>
        </motion.div>
      </header>
      <AnimatePresence>
        {open && <MobileMenu onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

/** A turf-green line under the nav that fills as you read down the page. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 });
  return <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-primary" style={{ scaleX }} />;
}

/** Two bars that cross into an X, with a little overshoot. */
function MenuButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const bar = 'absolute h-[2px] w-[18px] rounded-full bg-foreground';
  const spring = { type: 'spring' as const, stiffness: 420, damping: 24 };
  return (
    <motion.button onClick={onClick} aria-expanded={open} aria-controls="lp-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
      whileTap={{ scale: 0.9 }}
      className="relative z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card transition-colors duration-500 lg:hidden">
      <motion.span className={bar} animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -4 }} transition={spring} />
      <motion.span className={bar} animate={open ? { rotate: -45, y: 0, width: 18 } : { rotate: 0, y: 4, width: 12 }} transition={spring}
        style={{ originX: 0.5 }} />
    </motion.button>
  );
}

/**
 * The phone menu. A dark sheet grows out of the menu button as a circle, the
 * chapters fall into place one after another as big numbered rows, then the
 * account links and the one button that matters. Closing runs it backwards.
 * With reduced motion it simply fades.
 */
function MobileMenu({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);

  const chapters = [
    { t: 'The Desk', href: '#desk', m: DeskMark }, { t: 'Game Day', href: '#gameday', m: GameDayMark },
    { t: 'Install as an App', href: '#app', m: PhoneMark }, { t: 'Game of the Week', href: '#gotw', m: GameBallMark },
    { t: 'Analytics', href: '#analytics', m: SheetMark }, { t: 'Simulator', href: '#simulator', m: BranchMark },
    { t: 'Stadiums', href: '#franchise', m: StadiumMark },
    { t: 'Featured leagues', href: '#leagues', m: PennantMark }, { t: 'Pricing', href: '#pricing', m: RingMark },
  ];

  // Close first, then glide to the section once the page can scroll again.
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
    setTimeout(() => document.querySelector(href)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }), reduce ? 0 : 420);
  };

  const origin = 'calc(100% - 36px) 32px';
  const sheet = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { clipPath: `circle(0px at ${origin})` },
        show: { clipPath: `circle(160vmax at ${origin})`, transition: { duration: 0.6, ease: [0.76, 0, 0.24, 1] as const, staggerChildren: 0.055, delayChildren: 0.18 } },
        exit: { clipPath: `circle(0px at ${origin})`, transition: { duration: 0.45, ease: [0.76, 0, 0.24, 1] as const, delay: 0.12, staggerChildren: 0.025, staggerDirection: -1, when: 'afterChildren' as const } },
      };
  const row = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, y: 34, rotate: 1.5 },
        show: { opacity: 1, y: 0, rotate: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } },
        exit: { opacity: 0, y: 14, transition: { duration: 0.16 } },
      };
  const line = reduce
    ? { hidden: {}, show: {}, exit: {} }
    : { hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.6, ease } }, exit: { scaleX: 0, transition: { duration: 0.15 } } };

  return (
    <motion.div id="lp-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
      variants={sheet} initial="hidden" animate="show" exit="exit"
      className="lp-ink fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background px-5 pb-8 pt-20 md:pt-28 lg:hidden">
      <div className="lp-yardlines pointer-events-none absolute inset-0 opacity-70" />

      <ul className="relative">
        {chapters.map((c, i) => (
          <motion.li key={c.href} variants={row} className="relative">
            <a ref={i === 0 ? first : undefined} href={c.href} onClick={go(c.href)}
              className="group flex items-center gap-4 py-3.5 outline-none focus-visible:text-primary">
              <span className="lp-num w-7 text-[13px] font-extrabold text-muted-foreground transition-colors group-active:text-primary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="lp-display flex-1 text-[30px] font-extrabold leading-none tracking-[-0.03em] transition-transform duration-200 group-active:translate-x-1.5">
                {c.t}
              </span>
              <c.m size={26} style={{ ['--mark-accent' as string]: 'hsl(var(--primary))' }} className="shrink-0 text-muted-foreground" />
            </a>
            <motion.span variants={line} className="absolute inset-x-0 bottom-0 h-px origin-left bg-border" />
          </motion.li>
        ))}
      </ul>

      <motion.div variants={row} className="relative mt-7 flex flex-wrap gap-2 text-[14px] font-semibold">
        <a href="#faq" onClick={go('#faq')} className="rounded-full border border-border px-4 py-2.5 active:bg-muted">Questions</a>
        {accountsOn && <a href="/account" className="rounded-full border border-border px-4 py-2.5 active:bg-muted">Sign in to your leagues</a>}
        <a href={PLATFORM.github} target="_blank" rel="noreferrer" className="rounded-full border border-border px-4 py-2.5 active:bg-muted">Open source</a>
      </motion.div>

      <motion.div variants={row} className="relative mt-auto pt-10">
        <DemoMenuLink />
        <Link href="/start" onClick={onClose}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-[16px] font-semibold text-primary-foreground active:brightness-110">
          Start your {PLANS.pro.trialDays}-day free trial <Route size={16} />
        </Link>
        <p className="mt-3 text-center text-[12.5px] text-muted-foreground">No card needed. One subscription covers the whole league.</p>
      </motion.div>
    </motion.div>
  );
}

/** A headline that rises into place a word at a time, each word from behind its own mask. */
function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <>
      {text.split(' ').map((w, i, all) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className="inline-block" initial={reduce ? false : { y: '105%', rotate: 3 }} animate={{ y: '0%', rotate: 0 }}
            transition={{ duration: 0.75, ease, delay: delay + i * 0.07 }}>
            {w}{i < all.length - 1 ? '\u00a0' : ''}
          </motion.span>
        </span>
      ))}
    </>
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
            The custom app for your fantasy football leagues.
          </motion.p>
          <h1 className="lp-display mt-4 max-w-4xl text-[46px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[76px] lg:text-[88px]">
            <Words text="Making fantasy football" />{' '}
            <span className="lp-brand-text lp-underline-draw"><Words text="even better." delay={0.42} /></span>
          </h1>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 items-start gap-10 pb-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <motion.div className="min-w-0" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } }}>
            <motion.p variants={rise} className="max-w-md text-[17px] leading-relaxed text-muted-foreground">
              {PLATFORM.name} turns your Sleeper or ESPN league into its own app on any device. Analytics that give you the edge, AI writers who cover your actual teams,
              live chances to win, a guide to which games to have on, and every stat back to your first draft.
              Everyone installs it from the link in two taps. No app store.
            </motion.p>
            {accountsOn ? <motion.div variants={rise}><WelcomeBack fallback={<HeroForm q={q} setQ={setQ} />} /></motion.div> : <HeroForm q={q} setQ={setQ} />}
            <motion.div variants={rise}><DemoInvite /></motion.div>
            <motion.ul variants={rise} className="mt-9 grid max-w-md grid-cols-2 gap-x-5 gap-y-4 border-t border-border pt-6 sm:grid-cols-4">
              {([[PhoneMark, 'Installs as an app', '#app'], [DeskMark, 'AI desk', '#desk'], [GameDayMark, 'Game Day', '#gameday'], [SheetMark, 'Analytics', '#analytics']] as const).map(([M, label, href]) => (
                <li key={label}>
                  <a href={href} className="group flex items-center gap-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:flex-col sm:items-start sm:gap-1.5">
                    <M size={24} className="text-foreground transition-transform group-hover:-translate-y-0.5" />{label}
                  </a>
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <motion.div className="min-w-0" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.25 }}>
            <Trailer />
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
              {PLANS.pro.trialDays} days free, no card needed. One subscription covers the whole league.{' '}
              <Link href="/start?provider=espn" className="font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">On ESPN?</Link>{' '}
              <a href="#trailer" className="ml-1 inline-flex items-center gap-1 font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                <svg viewBox="0 0 24 24" className="h-3 w-3 text-[hsl(var(--signal))]" fill="currentColor" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" /></svg>Watch the trailer
              </a>
            </motion.p>
    </>
  );
}

/**
 * A wire-service ticker under the hero: the kind of thing the desk and the
 * live feeds produce all week, scrolling past. Sample league; it pauses on
 * hover and stands still for anyone who prefers reduced motion.
 */
function Ticker() {
  const items: [string, string][] = [
    ['Desk', 'Gridiron Ghosts stay No. 1 in this week\u2019s power rankings'],
    ['Live', 'GHO WR, 41-yd TD. +10.1, chance to win now 79%'],
    ['Trade grade', 'C minus for Fourth & Long Shots. Generously.'],
    ['Game of the Week', 'Ghosts vs Long Shots scores 84 out of 100'],
    ['Simulator', 'Ghosts make the playoffs in 97% of 10,000 seasons'],
    ['Waivers', 'Bench Mob claims a kicker. Again.'],
    ['Franchise HQ', 'Ghosts put up a halo board. Crowds up 6%'],
    ['Report', 'Punt Intended left 41.6 points on the bench'],
  ];
  const row = (hidden?: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map(([tag, text]) => (
        <li key={tag + text} className="flex items-center gap-2.5 whitespace-nowrap px-6 text-[13px]">
          <span className="rounded-md bg-background/10 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--turf-light))]">{tag}</span>
          <span className="text-background/85">{text}</span>
          <span className="ml-4 h-1 w-1 rounded-full bg-[hsl(var(--signal))]" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="lp-ticker relative overflow-hidden bg-foreground py-3" role="region" aria-label="Sample headlines">
      <div className="lp-ticker-track flex w-max">{row()}{row(true)}</div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-foreground to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-foreground to-transparent" />
    </div>
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
    { n: '06', t: 'Franchise HQ', m: StadiumMark, href: '#franchise' },
    { n: '07', t: 'History & more', m: RingMark, href: '#more' },
  ];
  // Which chapter is being read: the one crossing a line a third of the way down the screen.
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = items.map(i => document.querySelector(i.href)).filter((e): e is Element => Boolean(e));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(`#${e.target.id}`);
    }, { rootMargin: '-33% 0px -60% 0px' });
    els.forEach(e => io.observe(e));
    const top = () => { if (window.scrollY < 300) setActive(null); };
    window.addEventListener('scroll', top, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', top); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="border-y border-border bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 px-4 sm:grid-cols-4 sm:px-5 lg:grid-cols-7">
        {items.map((it, i) => {
          const on = active === it.href;
          return (
            <a key={it.n} href={it.href}
              className={cn('group relative flex items-center gap-3 border-border py-5 pr-3 transition-colors hover:text-primary lg:py-4',
                on && 'text-primary',
                i % 2 === 1 && 'pl-4 sm:pl-0', 'sm:[&:not(:nth-child(4n+1))]:pl-4 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:pl-4')}>
              <motion.span animate={on ? { y: -2, scale: 1.08 } : { y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                style={on ? { ['--mark-accent' as string]: 'hsl(var(--primary))' } : undefined}>
                <it.m size={26} className="shrink-0 transition-transform group-hover:-translate-y-0.5" />
              </motion.span>
              <span className="min-w-0">
                <span className="block text-[10.5px] font-semibold tabular-nums text-muted-foreground">{it.n}</span>
                <span className="lp-display block truncate text-[14.5px] font-bold lg:whitespace-normal lg:leading-tight">{it.t}</span>
              </span>
              {on && <motion.span layoutId="contents-active" className="absolute inset-x-0 bottom-0 hidden h-[3px] rounded-t-full bg-primary lg:block"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            </a>
          );
        })}
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
    <section id={id} className="scroll-mt-16 lg:scroll-mt-28 py-20 sm:py-28">
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
    <section id="gameday" className="lp-ink scroll-mt-16 lg:scroll-mt-28 py-20 sm:py-28">
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

/** Install as an App: most of a league lives on its phones, so it gets its own section. */
function InstallBand() {
  const steps = [
    { os: 'iPhone', how: <>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</> },
    { os: 'Android', how: <>Tap <b>Install app</b> when it offers, or find it in the browser menu.</> },
  ];
  return (
    <section id="app" className="relative scroll-mt-16 overflow-hidden py-20 lg:scroll-mt-28 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <motion.div className="min-w-0 lg:order-2" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div variants={rise} className="flex items-center gap-3">
            <PhoneMark size={24} />
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Install as an App</span>
          </motion.div>
          <motion.h2 variants={rise} className="lp-display mt-6 text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">
            It&apos;s an app. <span className="lp-brand-text">Minus the app store.</span>
          </motion.h2>
          <motion.p variants={rise} className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted-foreground">
            Most of your league will open it on a phone, on a Sunday, between plays. So it installs like an app:
            your league&apos;s name and icon on the home screen, full screen with no browser bars, one tap from the scores.
            Nothing to download, no store, no updates to wait for.
          </motion.p>
          <motion.ul variants={rise} className="mt-7 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
            {steps.map(s => (
              <li key={s.os} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{s.os}</p>
                <p className="mt-1.5 text-[14px] leading-snug [&_b]:font-semibold">{s.how}</p>
              </li>
            ))}
          </motion.ul>
          <motion.div variants={rise}><Points items={['Your league\u2019s name and icon on the home screen', 'Opens full screen, like any other app', 'Always the latest version, nothing to update']} /></motion.div>
        </motion.div>
        <motion.div className="min-w-0 lg:order-1" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease }}>
          <InstallApp />
          <p className="mt-4 text-center text-[11.5px] text-muted-foreground">Tap the phone or a step to see each part. Sample league.</p>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Franchise HQ, on a dark band like Game Day: the stadiums are the picture,
 * so they get the width. The text sits above them, in two columns on a wide
 * screen.
 */
function FranchiseBand() {
  return (
    <section id="franchise" className="lp-ink scroll-mt-16 overflow-hidden py-20 lg:scroll-mt-28 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <motion.div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16"
          initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }} variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <div className="min-w-0">
            <motion.div variants={rise} style={{ ['--mark-accent' as string]: 'hsl(var(--primary))' }}>
              <ChapterHead n="06" mark={StadiumMark} eyebrow="Franchise HQ" />
            </motion.div>
            <motion.h2 variants={rise} className="lp-display mt-6 text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">
              Every manager gets a stadium. <span className="lp-brand-text">Built on real results.</span>
            </motion.h2>
            <motion.p variants={rise} className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
              Each manager claims their team and runs it as a business on your league&apos;s actual games: set ticket prices,
              fill the seats, and spend what you make on upgrades. Pick one of six stadium styles and make it home, from the
              seats and the lights to the end zones and the skyline. Every upgrade goes up in 3D, built your style&apos;s way.
            </motion.p>
          </div>
          <motion.div variants={rise} className="min-w-0">
            <Points items={['Six styles, from a sunken coliseum to a domed arena', 'Your colors on the seats, the field, the crowd and the lights', 'Crowds and franchise values from every season you have played', 'Included with League Pass']} />
          </motion.div>
        </motion.div>
        <motion.div className="mt-12" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease }}>
          <Stadiums />
          <p className="mt-4 text-[11.5px] text-muted-foreground">Invented teams, every stadium fully built. Pictures from the app&apos;s own 3D view.</p>
        </motion.div>
      </div>
    </section>
  );
}

function AlsoInside() {
  const items = [
    { m: RingMark, t: 'Your whole history, kept', b: 'Champions, records and trophy cases through every season you have played. Every score, lineup, trade and pick is stored for good, and yours to download.' },
    { m: BracketMark, t: 'Every playoff bracket', b: 'Each season\u2019s bracket, round by round, the way your league\u2019s own settings played it: byes, two-week finals, consolation games. Tap any game for both lineups.' },
    { m: VersusMark, t: 'Rivalries', b: 'The head-to-head record between every pair of managers, regular season and playoffs counted apart, with every game they have played.' },
    { m: RadarMark, t: 'Next Gen stats', b: 'Luck, lineup efficiency, consistency and clutch, for one season or a whole career, charted for every team.' },
    { m: PlayMark, t: 'The weekly report', b: 'Best and worst lineups, the luckiest win and the points left on the bench, every week.' },
    { m: QuillMark, t: 'Write your own writers', b: 'Describe a character in a sentence. An assistant drafts their voice, handle and sample posts, and tweaks them until they sound right.' },
    { m: CharterMark, t: 'The rules, written down', b: 'Your league\u2019s constitution, kept by its admins with every version saved. And FantasyPros rankings, once you connect a key.' },
    { m: PennantMark, t: 'Your colors, your address', b: 'Your league\u2019s name, logo and colors on its own web address. Installs on phones like an app.' },
  ];
  return (
    <section id="more" className="scroll-mt-16 lg:scroll-mt-28 border-t border-border py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <ChapterHead n="07" mark={RingMark} eyebrow="Also inside" />
        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <motion.div key={it.t} initial="hidden" whileInView="show" viewport={{ once: true }} variants={rise}
              transition={{ delay: (i % 4) * 0.08 }}>
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
    { down: '1st & 10', m: FindMark, t: 'Find your league', b: 'Type your Sleeper username or paste your ESPN league ID, then pick the league. Nobody gives us a password.' },
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

/** Index of the featured plan, which phones open on. */
const FEATURED = 2;

function Pricing() {
  const [cycle, setCycle] = useState<'season' | 'monthly'>('season');
  const [teams, setTeams] = useState(12);
  const [asking, setAsking] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(FEATURED);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const head = (n: number) => `$${(n / teams).toFixed(2)}`;
  const priced = (p: { season: number; monthly: number }) => (cycle === 'season' ? p.season : p.monthly);
  const per = cycle === 'season' ? 'per year' : 'per month';

  const tiers: TierCard[] = [
    {
      name: PLANS.free.name, short: 'Free', price: '$0', per: 'forever',
      blurb: 'The whole app, open source. You bring the server, the database and the patience.',
      points: ['Every feature but Franchise HQ', 'Your own Vercel and Redis', 'Your own Anthropic key', 'Help from the community'],
      cta: { label: 'Get the code', href: PLATFORM.github, external: true },
    },
    {
      name: PLANS.pro.name, short: 'Pass', price: `$${priced(PLANS.pro)}`, per, note: `about ${head(priced(PLANS.pro))} a head`,
      blurb: 'Hosted on your league\u2019s own address. The AI writes on your own Anthropic key.',
      points: ['Every feature, every season kept for good', 'Franchise HQ for every manager', 'Sleeper or ESPN', 'AI on your own key, pay as you go', `${PLANS.pro.trialDays} days free, no card`],
      cta: { label: 'Start free trial', href: `/start?plan=${cycle}&tier=standard` },
    },
    {
      name: PLANS.ai.name, short: '+ AI', price: `$${priced(PLANS.ai)}`, per, note: `about ${head(priced(PLANS.ai))} a head`, featured: true, badge: 'Easiest',
      blurb: 'Everything in League Pass, and we run the AI. No key to find, no second bill.',
      points: ['Everything in League Pass', 'AI writers, chat and analytics included', 'Nothing to set up', `${PLANS.pro.trialDays} days free, no card`],
      cta: { label: 'Start free trial', href: `/start?plan=${cycle}&tier=ai` },
    },
    {
      name: PLANS.custom.name, short: 'Custom', price: 'Let\u2019s talk',
      blurb: 'For big ballers. A site designed around your league, built with you.',
      points: ['Your own design and branding', 'Features made for your league', 'Your own domain', 'Every season brought over for you'],
      cta: { label: 'Tell us your vision', onClick: () => setAsking(true) },
    },
  ];

  /** The card nearest the rail's left edge is the one in view. */
  const onRail = () => {
    const el = rail.current;
    if (!el) return;
    const cards = Array.from(el.children) as HTMLElement[];
    const x = el.scrollLeft + el.clientWidth / 2;
    const i = cards.reduce((best, c, k) => (Math.abs(c.offsetLeft + c.offsetWidth / 2 - x) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - x) ? k : best), 0);
    if (i !== active) setActive(i);
  };
  const goTo = (i: number, behavior: ScrollBehavior = 'smooth') => {
    const el = rail.current, card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior });
  };
  // Open on the featured plan; only matters while the cards are a rail.
  useEffect(() => {
    const el = rail.current;
    if (el && el.scrollWidth > el.clientWidth) goTo(FEATURED, 'instant');
  }, []);

  /** The receipt: what the price pays for, itemised, and the one thing that depends on the tier. */
  const receipt = [
    ['Your league\u2019s own website, up all year', 'Included'],
    ['Wrangling Sleeper or ESPN, live scores and odds every Sunday', 'Included'],
    ['Ten thousand simulated seasons, whenever you ask', 'Included'],
    ['A real person who fixes it when it breaks', 'Included'],
    ['Trash talk', 'Free, as always'],
  ];

  return (
    <section id="pricing" className="scroll-mt-16 lg:scroll-mt-28 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="lp-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[48px]">Costs less than last place.</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              One person pays and the whole league gets it. Run it yourself for nothing, let us host it, or let us run the AI too.
            </p>
          </div>
          {/* One switch for every card, and the league size the per-head prices use. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <div className="grid grid-cols-2 rounded-full border border-border bg-card p-1 text-[13px] font-semibold sm:inline-grid sm:self-start lg:self-end">
              {(['season', 'monthly'] as const).map(c => (
                <button key={c} onClick={() => setCycle(c)} aria-pressed={cycle === c}
                  className={cn('relative rounded-full px-4 py-2', cycle === c ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
                  {cycle === c && <motion.span layoutId="cycle" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
                  <span className="relative">{c === 'season' ? 'Yearly' : 'Monthly'}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[13px] text-muted-foreground max-sm:px-1">
              <span className="whitespace-nowrap"><span className="lp-num text-[17px] font-extrabold text-foreground">{teams}</span> teams</span>
              <input type="range" min={4} max={16} step={2} value={teams} onChange={e => setTeams(Number(e.target.value))} aria-label="How many teams"
                className="lp-range w-full sm:w-40" style={{ ['--fill' as string]: `${((teams - 4) / 12) * 100}%` }} />
            </label>
          </div>
        </div>

        {/* Phones: one plan at a time, swiped, opening on the featured one with
            its neighbours peeking either side. Wider: a grid. */}
        <div className="mt-8 flex justify-center gap-1 md:hidden" role="tablist" aria-label="Plans">
          {tiers.map((t, i) => (
            <button key={t.name} role="tab" aria-selected={active === i} onClick={() => goTo(i)}
              className={cn('relative rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors', active === i ? 'text-background' : 'text-muted-foreground')}>
              {active === i && <motion.span layoutId="plan-tab" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }} />}
              <span className="relative">{t.short ?? t.name}</span>
            </button>
          ))}
        </div>
        <motion.div ref={rail} onScroll={onRail} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="no-scrollbar -mx-4 -mb-8 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-10 pt-2 md:mx-0 md:mb-0 md:mt-10 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 md:pt-0 lg:grid-cols-4">
          {tiers.map(t => <TierCardView key={t.name} t={t} cycle={cycle} />)}
        </motion.div>
        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          {cycle === 'season'
            ? 'Pay once in August, forget about it until you\u2019re gloating in January. Renews yearly; cancel any time.'
            : 'For leagues with commitment issues. Cancel whenever, which is more than you can say for your round-two running back.'}
        </p>

        {/* Where the money goes */}
        <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease }}
          className="mt-10 grid grid-cols-1 gap-6 rounded-[22px] border border-border bg-card p-5 sm:gap-8 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <h3 className="lp-display text-[22px] font-extrabold sm:text-[24px] tracking-[-0.02em]">So where does the money go?</h3>
            <p className="mt-3 text-[14.5px] leading-relaxed text-muted-foreground">
              Into keeping your league&apos;s site fast on the one day a week everyone checks it at once. Here&apos;s the receipt.
            </p>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">The AI writers are the one line that changes.</span>{' '}
              On League Pass they bill your league&apos;s own Anthropic account, with a cap you set, and we never mark it up.
              On League Pass + AI they&apos;re on us. Everything that isn&apos;t AI works either way.
            </p>
            {/* Phones: the receipt waits behind a tap rather than adding a screen of scrolling. */}
            <button onClick={() => setReceiptOpen(o => !o)} aria-expanded={receiptOpen}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold md:hidden">
              {receiptOpen ? 'Hide the receipt' : 'Show the receipt'}
              <Route size={14} className={cn('transition-transform', receiptOpen ? '-rotate-90' : 'rotate-90')} />
            </button>
          </div>
          <div className={cn(!receiptOpen && 'max-md:hidden', 'rounded-2xl border border-dashed border-border bg-background px-3.5 py-4 font-mono text-[11px] leading-snug sm:px-5 sm:text-[12.5px]')}>
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">League Pass receipt</p>
            <ul className="mt-3 divide-y divide-dashed divide-border">
              {receipt.map(([what, how]) => (
                <li key={what} className="flex items-baseline justify-between gap-3 py-2 sm:gap-4">
                  <span>{what}</span><span className="shrink-0 text-muted-foreground">{how}</span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-4 py-2 text-muted-foreground">
                <span>AI writers</span><span className="shrink-0 text-right">Your key, or on us with + AI</span>
              </li>
            </ul>
            <div className="mt-2 space-y-1 border-t-2 border-foreground pt-2 font-semibold">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4"><span>League Pass</span><span>${PLANS.pro.season}/year or ${PLANS.pro.monthly}/mo</span></p>
              <p className="flex flex-wrap items-baseline justify-between gap-x-4"><span>League Pass + AI</span><span>${PLANS.ai.season}/year or ${PLANS.ai.monthly}/mo</span></p>
            </div>
          </div>
        </motion.div>
      </div>
      <AnimatePresence>{asking && <InquirySheet onClose={() => setAsking(false)} />}</AnimatePresence>
    </section>
  );
}

interface TierCard {
  name: string; short?: string; price: string; per?: string; note?: string; blurb: string; points: string[];
  featured?: boolean; badge?: string;
  cta: { label: string; href?: string; external?: boolean; onClick?: () => void };
}

/** One plan, as a card. The featured one is ink, the rest paper; prices animate with the billing switch. */
function TierCardView({ t, cycle }: { t: TierCard; cycle: string }) {
  const ink = t.featured;
  const cta = cn('mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[14.5px] font-semibold transition',
    ink ? 'bg-background text-foreground hover:bg-background/90' : 'border border-border hover:bg-muted');
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } } }}
      className={cn('relative flex w-[84%] max-w-[340px] shrink-0 snap-center flex-col rounded-[22px] p-6 sm:p-7 md:w-auto md:max-w-none', ink ? 'bg-foreground text-background shadow-[0_20px_36px_-24px_hsl(var(--foreground)/0.55)] md:shadow-[0_30px_60px_-30px_hsl(var(--foreground)/0.6)]' : 'border border-border bg-card')}>
      <div className="flex items-center justify-between gap-2">
        <p className="lp-display text-[17px] font-bold">{t.name}</p>
        {t.badge && <span className="rounded-full bg-[hsl(var(--signal))] px-2.5 py-0.5 text-[11px] font-bold text-white">{t.badge}</span>}
      </div>
      <div className="mt-4 sm:mt-5 lg:min-h-[76px]">
        <AnimatePresence mode="wait">
          <motion.p key={t.per ? `${t.price}-${cycle}` : t.price} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}
            className={cn('lp-num font-extrabold leading-none', t.price.startsWith('$') ? 'text-[46px] sm:text-[52px]' : 'text-[34px] tracking-[-0.02em] sm:text-[38px]')}>
            {t.price}
          </motion.p>
        </AnimatePresence>
        <p className={cn('mt-2 text-[12.5px]', ink ? 'text-background/65' : 'text-muted-foreground')}>
          {[t.per, t.note].filter(Boolean).join(', ') || '\u00a0'}
        </p>
      </div>
      <p className={cn('mt-4 text-[13.5px] leading-relaxed', ink ? 'text-background/80' : 'text-muted-foreground')}>{t.blurb}</p>
      <ul className="mb-7 mt-5 space-y-2.5 text-[13.5px]">
        {t.points.map(x => (
          <li key={x} className="flex gap-2.5">
            <Tick className="mt-0.5 shrink-0" style={ink ? { ['--primary' as string]: '154 62% 52%' } : undefined} />{x}
          </li>
        ))}
      </ul>
      {t.cta.onClick
        ? <button onClick={t.cta.onClick} className={cta}>{t.cta.label} <Route size={16} /></button>
        : t.cta.external
          ? <a href={t.cta.href} target="_blank" rel="noreferrer" className={cta}>{t.cta.label} <Route size={16} /></a>
          : <Link href={t.cta.href!} className={cta}>{t.cta.label} <Route size={16} /></Link>}
    </motion.div>
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
    ['Is this made by Sleeper or ESPN?', `No. ${PLATFORM.name} is independent. It reads the public data Sleeper publishes for every league, or your league\u2019s data from ESPN. It never asks for your password and never changes anything in your league.`],
    ['Does it work with ESPN?', 'Yes. Paste your ESPN league ID. Most ESPN leagues are private, so one member copies two cookies from their browser once (sign-up shows how). ESPN signs those out after about a year, and your admin page asks for fresh ones when it does. Scores, standings, history, drafts and trades all come across.'],
    ['Does everyone in the league have to pay?', 'No. One subscription covers the whole league. Everyone else just opens the link.'],
    ['Why isn\u2019t it free?', `The code is free to host yourself. The paid plan is for convenience, because running a site that a dozen people refresh every thirty seconds on Sunday costs real money, and so does the person keeping it up. The code is free if you want to run it yourself. The hosted version costs about what your league spends on wings in one draft night, split ${'$'}${(PLANS.pro.season / 12).toFixed(2)} a head. I'm happy to handle it for you.`],
    ['Dynasty, keeper, redraft?', 'All of them. Any Sleeper or ESPN league, any scoring. Every season is linked together, so dynasty and keeper history carries through.'],
    ['Is our league\u2019s data ours?', 'Yes. Every season LeaguePulse reads, every score, lineup, trade and draft pick, is kept in your league\u2019s own archive, even if Sleeper or ESPN later lets it go. Admins can download all of it as Excel, CSV or JSON whenever they like, so you are never locked in.'],
    ['How does the AI get paid for?', 'Two ways. On League Pass, your league adds its own Anthropic API key and pays Anthropic directly, with a monthly cap you set. On League Pass + AI it\u2019s included: we run it, within generous daily limits. Everything that isn\u2019t AI works either way.'],
    ['Will the AI make things up?', 'It writes from your league’s real data, and every post is checked against the standings, trades and live game status before it goes up. Anything that fails the check is rewritten or dropped.'],
    ['What is Franchise HQ?', 'A game inside the app, included with League Pass. Each manager claims their team and runs it as a business on your league\u2019s real results: ticket prices, crowds, upgrades, and a 3D stadium in one of six styles, dressed in their own colors. Franchise values count every season you have played, championships included.'],
    ['Who controls the settings?', 'Whoever sets it up is the admin: name, colors, logo, the cast of writers and what gets posted.'],
    ['What about the offseason?', 'The site stays up with all its history. On the monthly plan you can cancel and come back before the draft.'],
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-16 lg:scroll-mt-28 py-20 sm:py-28">
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

/** Leans gently toward the pointer as it comes close. Mouse only. */
function Magnetic({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 15 }), y = useSpring(0, { stiffness: 220, damping: 15 });
  return (
    <motion.div className="inline-block" style={{ x, y }}
      onPointerMove={e => {
        if (reduce || e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.25); y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

function FinalCta() {
  return (
    <section className="lp-ink relative overflow-hidden pb-16 pt-24 sm:pt-32">
      <div className="lp-yardlines pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        <h2 className="lp-display max-w-4xl text-[44px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[72px]">
          Your league already has the stories. <span className="text-primary">Give them some life... a pulse if you will.</span>
        </h2>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Magnetic>
            <Link href="/start" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 text-[15px] font-semibold text-primary-foreground transition hover:brightness-110">
              Find my league <Route size={16} />
            </Link>
          </Magnetic>
          <span className="text-center text-[13.5px] text-muted-foreground sm:text-left">{PLANS.pro.trialDays} days free. Set up in a minute.</span>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  const cols: { title: string; links: { label: string; href: string; external?: boolean; muted?: boolean }[] }[] = [
    { title: 'The product', links: [
      { label: 'The Desk', href: '#desk' }, { label: 'Game Day', href: '#gameday' }, { label: 'Game of the Week', href: '#gotw' },
      { label: 'Analytics', href: '#analytics' }, { label: 'Simulator', href: '#simulator' }, { label: 'Featured leagues', href: '#leagues' },
      { label: 'Pricing', href: '#pricing' },
    ] },
    { title: 'Your league', links: [
      { label: 'Start a league', href: '/start' },
      ...(accountsOn ? [{ label: 'Sign in', href: '/account' }, { label: 'My leagues', href: '/account' }] : []),
      { label: 'Questions', href: '#faq' },
      ...(accountsOn ? [{ label: 'Back office', href: '/operator', muted: true }] : []),
    ] },
    { title: 'Open source', links: [
      { label: 'GitHub', href: PLATFORM.github, external: true },
      { label: 'Run it yourself', href: `${PLATFORM.github}#readme`, external: true },
      { label: 'License (AGPL)', href: `${PLATFORM.github}/blob/main/LICENSE`, external: true },
    ] },
    { title: 'The fine print', links: [
      ...(PLATFORM.supportEmail ? [{ label: 'Support', href: `mailto:${PLATFORM.supportEmail}` }] : []),
      { label: 'Terms', href: '/legal/terms' }, { label: 'Privacy', href: '/legal/privacy' },
    ] },
  ];
  return (
    <footer className="lp-ink relative overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-border pt-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" onClick={e => toTop(e)} className="inline-flex"><Lockup size={36} text={24} /></Link>
            <p className="mt-4 max-w-[17rem] text-[13.5px] leading-relaxed text-muted-foreground">
              A press box for your fantasy league. Made for leagues that take it far too seriously.
            </p>
          </div>
          {cols.map(col => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{col.title}</p>
              <ul className="mt-4 space-y-2.5 text-[14px]">
                {col.links.map(l => (
                  <li key={l.label}>
                    <a href={l.href} {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className={cn('group inline-flex items-center gap-1.5 transition-colors hover:text-primary', l.muted ? 'text-muted-foreground' : 'text-foreground/90')}>
                      {l.label}
                      {l.external && <Route size={12} className="-rotate-45 opacity-50 transition group-hover:opacity-100" />}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The sign-off: the wordmark, set huge, half off the bottom like a stadium end-zone paint job. */}
        <p aria-hidden className="lp-wordmark pointer-events-none mt-16 select-none whitespace-nowrap text-[17.5vw] leading-[0.74] text-foreground/[0.07] md:text-[190px]">
          {PLATFORM.name}
        </p>
        <div className="relative -mt-6 flex flex-col gap-2 border-t border-border py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:-mt-10">
          <p>&copy; {year} {PLATFORM.name}. Not affiliated with Sleeper, the NFL or ESPN.</p>
          <p>Sample data on this page. Your league brings its own drama.</p>
        </div>
      </div>
    </footer>
  );
}
