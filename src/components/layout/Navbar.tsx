'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Swords,
  Database,
  Activity,
  Newspaper,
  Megaphone,
  Receipt,
  ClipboardCheck,
  ClipboardList,
  Scroll,
  Sword,
  Shuffle,
  Shirt,
  ListOrdered,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Logo from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { useInstallPrompt } from '@/components/pwa/InstallPromptProvider';
import { AddSquareIcon } from '@/components/icons/AppIcons';
import SearchPalette from './SearchPalette';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The four destinations worth a permanent slot.
 *
 * Home is reachable from the logo, and Matchups and Rivalries moved into the
 * menu: they are things you look up, where these four are things you read.
 */
const PRIMARY_NAV: NavItem[] = [
  { name: 'Next Gen',      href: '/next-gen', icon: Activity        },
  { name: 'History',       href: '/history',  icon: Database        },
  { name: 'Weekly Report', href: '/report',   icon: ClipboardCheck  },
  { name: 'The Feed',      href: '/desk',     icon: Megaphone       },
];

const MORE_NAV: NavItem[] = [
  { name: 'Home',         href: '/',             icon: LayoutDashboard },
  { name: 'Matchups',     href: '/matchups',     icon: Swords       },
  { name: 'Rivalries',    href: '/rivalries',    icon: Sword        },
  { name: 'Standings',    href: '/standings',    icon: ListOrdered  },
  { name: 'Rosters',      href: '/rosters',      icon: Shirt        },
  // Power Rankings (/analyzer) is built and working but unlinked: the free
  // FantasyPros tier caps every board at 10 rows, so only ~40 of ~200
  // rostered players are ranked and team scores are not trustworthy yet.
  // Re-add this entry once a tier without the row cap is available.
  { name: 'Player Rankings', href: '/rankings',  icon: ListOrdered  },
  { name: 'Schedule Lab', href: '/schedule-lab', icon: Shuffle      },
  { name: 'Transactions', href: '/transactions', icon: Receipt      },
  { name: 'Drafts',       href: '/drafts',       icon: ClipboardList },
  // Weather is built and reachable at /weather, but unlinked for now.
  // Re-add this line to put it back in the menu.
  // { name: 'Weather',      href: '/weather',      icon: CloudSun     },
  { name: 'Media',        href: '/media',        icon: Newspaper    },
  { name: 'Constitution', href: '/constitution', icon: Scroll       },
];

/**
 * The same destinations, grouped by what you would be trying to do.
 *
 * The mobile drawer listed all fifteen in one undifferentiated column of
 * uppercase text, which is the hardest possible thing to scan. Grouping gives
 * the eye somewhere to land, and the labels are the question you are asking
 * rather than a category name: you open this menu wanting to check on the
 * week, dig into something, catch up, or look something up.
 */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'This week',
    items: [
      { name: 'Home',      href: '/',          icon: LayoutDashboard },
      { name: 'Matchups',  href: '/matchups',  icon: Swords          },
      { name: 'Standings', href: '/standings', icon: ListOrdered     },
      // The report is about the week just played, so it belongs with the
      // other things you check on a Tuesday rather than with the deep dives.
      { name: 'Weekly Report', href: '/report',  icon: ClipboardCheck },
    ],
  },
  {
    label: 'Dig in',
    items: [
      { name: 'Next Gen',      href: '/next-gen',     icon: Activity       },
      // Somewhere you go to explore, not to look one thing up.
      { name: 'History',       href: '/history',      icon: Database       },
      { name: 'Rivalries',     href: '/rivalries',    icon: Sword          },
      { name: 'Schedule Lab',  href: '/schedule-lab', icon: Shuffle        },
    ],
  },
  {
    label: 'Catch up',
    items: [
      { name: 'The Feed',     href: '/desk',         icon: Megaphone     },
      { name: 'Media',        href: '/media',        icon: Newspaper     },
      { name: 'Rosters',      href: '/rosters',      icon: Shirt         },
      { name: 'Transactions', href: '/transactions', icon: Receipt       },
    ],
  },
  {
    label: 'Look it up',
    items: [
      { name: 'Drafts',          href: '/drafts',       icon: ClipboardList },
      { name: 'Player Rankings', href: '/rankings',     icon: ListOrdered },
      { name: 'Constitution',    href: '/constitution', icon: Scroll      },
    ],
  },
];

const ALL_NAV = [...PRIMARY_NAV, ...MORE_NAV];

interface NavbarProps {
  logoUrl?: string | null;
  leagueName?: string | null;
}

export default function Navbar({ logoUrl, leagueName }: NavbarProps) {
  const pathname  = usePathname();
  const [isOpen,    setIsOpen]    = useState(false);
  const [moreOpen,  setMoreOpen]  = useState(false);
  const [scrolled,  setScrolled]  = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const { platform, isStandalone, openModal } = useInstallPrompt();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    // Coalesced to one read per frame. Reading scrollY straight from the
    // event handler runs a layout read for every event a fast flick emits,
    // which is the kind of thing that makes scrolling feel gritty.
    let frame = 0;
    const handler = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 8);
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => { setIsOpen(false); setMoreOpen(false); }, [pathname]);

  // Close "More" dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const isMoreActive = MORE_NAV.some(item => pathname === item.href);

  // Lighter and more transparent at rest so the ambient background reads
  // through it; condenses into frosted glass once you scroll.
  const navbarClass = cn(
    'sticky top-0 z-50 w-full',
    'transition-[background-color,border-color,box-shadow] duration-300',
    scrolled
      ? 'bg-background/85 backdrop-blur-2xl border-b border-border/70 shadow-[0_1px_0_hsl(var(--border)/0.5),0_10px_36px_-10px_hsl(0_0%_0%/0.55)]'
      : 'bg-background/55 backdrop-blur-xl border-b border-border/25',
  );

  const brand = (
    <>
      <div className="relative shrink-0">
        {/* Accent halo blooms on hover */}
        
        <Logo
          src={logoUrl}
          className="relative h-11 w-auto sm:h-14 lg:h-20 xl:h-24 object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      {leagueName ? (
        <span className="line-clamp-2 min-w-0 font-display text-[15px] font-bold leading-[1.15] text-foreground sm:text-lg lg:text-xl xl:text-2xl">
          {leagueName}
        </span>
      ) : (
        <span className="font-display text-lg lg:text-xl xl:text-2xl font-bold tracking-widest text-foreground uppercase">
          League <span className="text-primary">Pulse</span>
        </span>
      )}
    </>
  );

  if (!mounted) {
    return (
      <header className={navbarClass}>
        <nav className="mx-auto flex h-16 sm:h-20 lg:h-24 xl:h-28 max-w-7xl items-center justify-between pl-2 pr-3 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
          <Link href="/" className="group flex min-w-0 flex-1 items-center gap-2 sm:gap-3 lg:flex-none lg:shrink">
            {brand}
          </Link>
          <div className="h-8 w-8" />
        </nav>
      </header>
    );
  }

  return (
    <>
      <header className={navbarClass}>
        

        <nav className="mx-auto flex h-16 sm:h-20 lg:h-24 xl:h-28 max-w-7xl items-center justify-between pl-2 pr-3 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
          {/* Logo */}
          <Link href="/" className="group flex min-w-0 flex-1 items-center gap-2 sm:gap-3 lg:flex-none lg:shrink">
            {brand}
          </Link>

          {/* Desktop nav, kicks in at lg (1024px), not md (768px), since md
              lands right in iPad-portrait territory (768-834px) and the full
              5-link row plus the More dropdown doesn't fit there. */}
          <div className="hidden xl:flex xl:items-center xl:gap-1">
            {PRIMARY_NAV.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-1.5 px-2.5 xl:px-3.5 py-2.5 text-xs font-semibold uppercase tracking-widest rounded-lg transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                  )}
                >
                  {/* Pill is rendered first and the label lifted above it ,
                      previously the absolutely-positioned pill painted over
                      the icon and text, dimming them. */}
                  {isActive && (
                    <>
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20"
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                      />
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-px inset-x-2.5 h-[2px] rounded-full bg-primary"
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                      />
                    </>
                  )}
                  <item.icon className="relative h-3.5 w-3.5 shrink-0" />
                  <span className="relative">{item.name}</span>
                </Link>
              );
            })}

            {/* More dropdown */}
            <div ref={moreRef} className="relative">
              <button
                onClick={() => setMoreOpen(o => !o)}
                className={cn(
                  'relative flex items-center gap-1.5 px-2.5 xl:px-3.5 py-2.5 text-xs font-semibold uppercase tracking-widest rounded-lg transition-colors',
                  isMoreActive || moreOpen
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                {isMoreActive && (
                  <>
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute -bottom-px inset-x-2.5 h-[2px] rounded-full bg-primary"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                  </>
                )}
                <span className="relative">More</span>
                <ChevronDown className={cn('relative h-3 w-3 transition-transform duration-200', moreOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{    opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur-xl"
                  >
                    {/* The same four groups, in the same order, as the mobile
                        sheet. Anything already in the top bar is left out
                        rather than repeated a few pixels below itself. */}
                    {NAV_GROUPS.map(group => {
                      const items = group.items.filter(
                        item => !PRIMARY_NAV.some(p => p.href === item.href),
                      );
                      if (!items.length) return null;
                      return (
                        <div key={group.label} className="mb-2 last:mb-0">
                          <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                            {group.label}
                          </p>
                          {items.map(item => {
                            const isActive = pathname === item.href;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMoreOpen(false)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                  'flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors',
                                  isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-foreground hover:bg-muted/60',
                                )}
                              >
                                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                {item.name}
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* One index for the palette, built from the same nav lists so a
                page can never be navigable but unsearchable. */}
            <SearchPalette
              pages={ALL_NAV.map(n => ({
                id: n.href,
                label: n.name,
                href: n.href,
                group: 'Pages',
              }))}
            />
            <ThemeToggle />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:border-border xl:hidden"
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer.

          A full height sheet rather than the old dropdown: fifteen links in a
          panel hanging off the header meant a cramped, scrolling list of
          uppercase text with no structure. This has room to group them, and
          the groups are what make it scannable. */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              // Above the chat launcher at z-[72]; a modal menu should cover a
              // floating button, not sit under it. Below the search palette
              // at z-[80], which can be opened from anywhere.
              className="fixed inset-0 z-[74] bg-background/70 backdrop-blur-sm xl:hidden"
              aria-hidden
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              // Bounded so it never becomes a full-bleed wall of links on a
              // tablet, and inset-safe so the last row clears the home bar.
              className="fixed inset-y-0 right-0 z-[76] flex w-[86%] max-w-sm flex-col border-l border-border bg-card shadow-2xl xl:hidden"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Menu
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {NAV_GROUPS.map((group, gi) => (
                  <div key={group.label} className={gi > 0 ? 'mt-5' : undefined}>
                    <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item, i) => {
                        const isActive = pathname === item.href;
                        return (
                          <motion.div
                            key={item.href}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            // Staggered by position across the whole sheet, so
                            // the list arrives as one movement rather than four.
                            transition={{ delay: 0.04 + (gi * 4 + i) * 0.012, duration: 0.2 }}
                          >
                            <Link
                              href={item.href}
                              onClick={() => setIsOpen(false)}
                              aria-current={isActive ? 'page' : undefined}
                              className={cn(
                                'flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-2 transition-colors',
                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-foreground hover:bg-accent',
                              )}
                            >
                              <span className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                                isActive
                                  ? 'border-primary/30 bg-primary/10 text-primary'
                                  : 'border-border text-muted-foreground',
                              )}>
                                <item.icon className="h-4 w-4" />
                              </span>
                              {/* Sentence case, not the uppercase widely
                                  tracked style of the old list. At this size
                                  that styling is actively harder to read. */}
                              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                                {item.name}
                              </span>
                              {isActive && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                              )}
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {platform !== 'other' && !isStandalone && (
                  <div className="mt-5 border-t border-border pt-3">
                    <button
                      onClick={() => { setIsOpen(false); openModal(); }}
                      className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-foreground transition-colors hover:bg-accent"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                        <AddSquareIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                        Add to home screen
                      </span>
                    </button>
                  </div>
                )}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
