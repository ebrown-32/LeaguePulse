'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Swords,
  Database,
  Activity,
  Newspaper,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import Logo from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
  { name: 'Overview',  href: '/',         icon: LayoutDashboard },
  { name: 'Matchups',  href: '/matchups', icon: Swords          },
  { name: 'History',   href: '/history',  icon: Database        },
  { name: 'Next Gen',  href: '/next-gen', icon: Activity        },
  { name: 'Media',     href: '/media',    icon: Newspaper       },
];

interface NavbarProps {
  logoUrl?: string | null;
  leagueName?: string | null;
}

export default function Navbar({ logoUrl, leagueName }: NavbarProps) {
  const pathname  = usePathname();
  const [isOpen,   setIsOpen]   = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  const navbarClass = cn(
    'sticky top-0 z-50 w-full',
    'bg-background/80 backdrop-blur-xl',
    scrolled
      ? 'border-b border-border/60 shadow-[0_1px_0_hsl(var(--border)/0.4),0_4px_24px_-4px_hsl(0_0%_0%/0.4)]'
      : 'border-b border-border/30',
  );

  if (!mounted) {
    return (
      <header className={navbarClass}>
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo src={logoUrl} />
            {leagueName ? (
              <div className="flex flex-col leading-none">
                <span className="font-display text-sm font-semibold text-foreground">{leagueName}</span>
                <span className="text-[9px] font-medium tracking-widest text-primary/70 uppercase">powered by League Pulse</span>
              </div>
            ) : (
              <span className="font-display text-sm font-semibold tracking-wide text-foreground">
                LEAGUE <span className="text-primary">PULSE</span>
              </span>
            )}
          </Link>
          <div className="h-8 w-8" />
        </nav>
      </header>
    );
  }

  return (
    <>
      <header className={navbarClass}>
        {/* Subtle gradient line at top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative">
              <Logo src={logoUrl} />
              <div className="absolute inset-0 blur-md opacity-0 group-hover:opacity-60 transition-opacity duration-300 bg-primary rounded-full" />
            </div>
            {leagueName ? (
              <div className="flex flex-col leading-none">
                <span className="font-display text-sm font-semibold text-foreground">{leagueName}</span>
                <span className="text-[9px] font-medium tracking-widest text-primary/70 uppercase">powered by League Pulse</span>
              </div>
            ) : (
              <span className="font-display text-sm font-semibold tracking-widest text-foreground uppercase">
                League <span className="text-primary">Pulse</span>
              </span>
            )}
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex md:items-center md:gap-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'group relative flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold uppercase tracking-widest rounded-md transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.name}</span>
                  {isActive && (
                    <>
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-md bg-primary/8 dark:bg-primary/10"
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                      />
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute bottom-0 inset-x-3 h-px bg-primary rounded-full"
                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                      />
                    </>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="
                inline-flex h-8 w-8 items-center justify-center rounded-md
                border border-border/60 bg-card/80 text-muted-foreground
                hover:text-foreground hover:border-border md:hidden
              "
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="
              fixed inset-x-0 top-16 z-40 md:hidden
              border-b border-border/60 bg-background/95 backdrop-blur-xl
              shadow-[0_8px_32px_-4px_hsl(0_0%_0%/0.4)]
            "
          >
            {/* Gradient separator */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <nav className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-0.5">
              {navigation.map((item) => {
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
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
