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
  Receipt,
  ClipboardList,
  Scroll,
  Sword,
  Shuffle,
  Shirt,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Logo from '@/components/ui/Logo';
import { cn } from '@/lib/utils';
import { useInstallPrompt } from '@/components/pwa/InstallPromptProvider';
import { AddSquareIcon } from '@/components/icons/AppIcons';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { name: 'Home',      href: '/',          icon: LayoutDashboard },
  { name: 'Matchups',  href: '/matchups',  icon: Swords          },
  { name: 'Rivalries', href: '/rivalries', icon: Sword           },
  { name: 'Next Gen',  href: '/next-gen',  icon: Activity        },
  { name: 'History',   href: '/history',   icon: Database        },
];

const MORE_NAV: NavItem[] = [
  { name: 'Rosters',      href: '/rosters',      icon: Shirt        },
  { name: 'Schedule Lab', href: '/schedule-lab', icon: Shuffle      },
  { name: 'Transactions', href: '/transactions', icon: Receipt      },
  { name: 'Drafts',       href: '/drafts',       icon: ClipboardList },
  { name: 'Media',        href: '/media',        icon: Newspaper    },
  { name: 'Constitution', href: '/constitution', icon: Scroll       },
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
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
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
          className="relative h-16 w-auto lg:h-20 xl:h-24 object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      {leagueName ? (
        <span className="min-w-0 truncate font-display text-lg font-bold leading-tight text-foreground lg:text-xl xl:text-2xl">
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
        <nav className="mx-auto flex h-20 lg:h-24 xl:h-28 max-w-7xl items-center justify-between pl-2 pr-4 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
          <Link href="/" className="group flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:shrink">
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
        

        <nav className="mx-auto flex h-20 lg:h-24 xl:h-28 max-w-7xl items-center justify-between pl-2 pr-4 sm:pl-3 sm:pr-6 lg:pl-4 lg:pr-8">
          {/* Logo */}
          <Link href="/" className="group flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:shrink">
            {brand}
          </Link>

          {/* Desktop nav — kicks in at lg (1024px), not md (768px), since md
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
                  {/* Pill is rendered first and the label lifted above it —
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
                    className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-lg py-1.5 z-50"
                  >
                    {MORE_NAV.map(item => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors',
                            isActive
                              ? 'text-primary bg-primary/8'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                          )}
                        >
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
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

      {/* Mobile drawer, all items */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-x-0 top-20 lg:top-24 z-40 xl:hidden border-b border-border/60 bg-background/95 backdrop-blur-xl shadow-[0_8px_32px_-4px_hsl(0_0%_0%/0.4)]"
          >
            
            <nav className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-0.5">
              {ALL_NAV.map(item => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold uppercase tracking-widest',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}

              {platform !== 'other' && !isStandalone && (
                <>
                  <div className="my-1.5 border-t border-border/60" />
                  <button
                    onClick={() => { setIsOpen(false); openModal(); }}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
                  >
                    <AddSquareIcon className="h-4 w-4 shrink-0" />
                    <span>Add to Home Screen</span>
                  </button>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
