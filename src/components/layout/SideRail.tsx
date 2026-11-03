'use client';

/**
 * The desktop navigation (xl and up): a rail floating down the left edge, in place of the top bar
 * and its More menu. LeaguePulse's marquee pages first, as tiles (the phone menu's front door),
 * then every other destination in the phone menu's four groups, with the page you are on lit.
 * Preferences (components/layout/Preferences) open from the gear at the foot of it.
 *
 * It folds down to icons (each named on hover), and remembers that in this browser. The width
 * lives in CSS (`--lp-rail-w` on <html>, whose data-rail the server sets from a cookie; globals.css),
 * so the page never jumps on load: the page's own offset reads the same variable.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Settings, Sidebar } from '@/components/icons';
import { AddSquareIcon } from '@/components/icons/AppIcons';
import Logo from '@/components/ui/Logo';
import PoweredBy from '@/components/ui/PoweredBy';
import { useInstallPrompt } from '@/components/pwa/InstallPromptProvider';
import { cn } from '@/lib/utils';
import AccountChip from './AccountChip';
import PreferencesPanel from './Preferences';
import { RAIL_COOKIE } from './railCookie';
import { OPEN_SEARCH } from './SearchPalette';

export interface RailItem { name: string; href: string; icon: React.ComponentType<{ className?: string }> }
export interface RailGroup { label: string; items: RailItem[] }

const isIn = (pathname: string, href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

/** `legal`: LeaguePulse's terms and privacy pages, on a hosted site (a self-hosted copy has none of its own). */
export default function SideRail({ featured, groups, logoUrl, leagueName, legal }: {
  featured: RailItem[]; groups: RailGroup[]; logoUrl?: string | null; leagueName?: string | null; legal?: { terms: string; privacy: string } | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tip, setTip] = useState<{ label: string; y: number } | null>(null);
  const { platform, isStandalone, openModal } = useInstallPrompt();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const aside = useRef<HTMLElement>(null);
  const prefsBox = useRef<HTMLDivElement>(null);

  useEffect(() => { setCollapsed(document.documentElement.dataset.rail === 'collapsed'); }, []);
  useEffect(() => { setTip(null); setPrefsOpen(false); }, [pathname, collapsed]);
  useEffect(() => {
    if (!prefsOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!prefsBox.current?.contains(t) && !(t as HTMLElement).closest?.('[data-prefs-toggle]')) setPrefsOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPrefsOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [prefsOpen]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.rail = 'collapsed'; else delete document.documentElement.dataset.rail;
    document.cookie = `${RAIL_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  };

  // Folded, each control is named in a label floating beside the rail (outside it, so the
  // scrolling list can't clip it).
  const hint = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!collapsed) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2 });
    },
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (!collapsed) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2 });
    },
    onBlur: () => setTip(null),
  });

  const brandName = leagueName || 'LeaguePulse';

  return (
    <>
      <aside ref={aside} aria-label="Site" className="lp-rail fixed bottom-4 left-4 top-4 z-[60] hidden xl:block">
        {/* The league's own surface (lp-surface: palette, border, the theme's shadow), its radius on the
            appearance setting's scale, raised to the floating level. */}
        <div className="lp-surface lp-edge lp-float relative flex h-full flex-col overflow-hidden rounded-2xl backdrop-blur-2xl">
          {/* The league's color, glowing in from the top. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(120%_80%_at_0%_0%,hsl(var(--primary)/0.16),transparent_70%)]" />

          {/* Brand */}
          <Link href="/" className="group relative flex items-center gap-3 px-4 pb-3 pt-4 lp-rail-folded:justify-center lp-rail-folded:px-0" {...hint(brandName)}>
            <Logo src={logoUrl} className="h-11 w-11 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105" />
            <span className="lp-rail-label line-clamp-2 min-w-0 font-display text-[15px] font-bold leading-[1.15] text-foreground">
              {leagueName ?? <>League <span className="text-primary">Pulse</span></>}
            </span>
          </Link>

          {/* Search */}
          <div className="relative px-3 pb-2">
            <button onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))} {...hint('Search')}
              aria-label="Search"
              className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background/50 px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground lp-rail-folded:justify-center lp-rail-folded:px-0">
              <Search className="h-4 w-4 shrink-0" />
              <span className="lp-rail-label flex-1 text-left">Search</span>
              <kbd className="lp-rail-label rounded-md border border-border bg-card px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground">⌘K</kbd>
            </button>
          </div>

          {/* Everywhere you can go */}
          <nav className="lp-rail-scroll relative flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* The marquee: LeaguePulse's front door, as tiles. Folded, the first icons. */}
            <div className="grid grid-cols-2 gap-2 pb-1 pt-1 lp-rail-folded:grid-cols-1 lp-rail-folded:gap-0.5">
              {featured.map(item => {
                const active = isIn(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.name} {...hint(item.name)}
                    className={cn(
                      'group relative flex h-[66px] flex-col justify-between overflow-hidden rounded-2xl border p-2.5 outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/50',
                      'lp-rail-folded:h-10 lp-rail-folded:items-center lp-rail-folded:justify-center lp-rail-folded:rounded-xl lp-rail-folded:p-0',
                      active
                        ? 'border-primary/50 bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_hsl(var(--primary)/0.9)]'
                        : 'lp-rail-tile border-border/70 bg-background/40 text-foreground hover:border-primary/40 hover:bg-background/70 hover:shadow-[var(--elev-2)] lp-rail-folded:border-transparent lp-rail-folded:bg-transparent',
                    )}>
                    {active && <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/20 blur-xl lp-rail-folded:hidden" />}
                    <span className={cn('lp-chip relative h-7 w-7 rounded-lg transition-transform duration-200 group-hover:scale-110 [&>svg]:h-4 [&>svg]:w-4',
                      active ? '!bg-white/20 !text-primary-foreground ring-1 ring-white/30' : 'lp-chip-muted')}>
                      <item.icon />
                    </span>
                    <span className="lp-rail-label relative truncate font-display text-[13.5px] font-bold leading-tight">{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {groups.map((group, gi) => (
              <div key={group.label} className="mt-4">
                <p className="lp-rail-label px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">{group.label}</p>
                <div aria-hidden className="lp-rail-divider mx-auto mb-2 h-px w-6 bg-border" />
                <ul className="space-y-0.5">
                  {group.items.map(item => {
                    const active = isIn(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.name} {...hint(item.name)}
                          className={cn(
                            'group relative flex h-10 items-center gap-3 rounded-xl px-2 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 lp-rail-folded:justify-center lp-rail-folded:px-0',
                            active ? 'text-primary' : 'text-foreground/80 hover:bg-foreground/[0.045] hover:text-foreground',
                          )}>
                          {active && (
                            <>
                              <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl bg-primary/[0.11] ring-1 ring-inset ring-primary/25"
                                transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                              <motion.span layoutId="rail-bar" className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.7)]"
                                transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />
                            </>
                          )}
                          <span className={cn('lp-chip relative h-7 w-7 shrink-0 rounded-lg transition-transform duration-200 group-hover:scale-110 [&>svg]:h-4 [&>svg]:w-4', !active && 'lp-chip-muted')}>
                            <item.icon />
                          </span>
                          <span className="lp-rail-label relative min-w-0 flex-1 truncate">{item.name}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Footer: the app, the lights, you, and the fold. */}
          <div className="relative space-y-2 border-t border-border/70 p-3">
            {platform !== 'other' && !isStandalone && (
              <button onClick={openModal} {...hint('Install as an app')}
                className="flex h-9 w-full items-center gap-3 rounded-xl px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground lp-rail-folded:justify-center lp-rail-folded:px-0">
                <AddSquareIcon className="h-4 w-4 shrink-0" />
                <span className="lp-rail-label">Install as an app</span>
              </button>
            )}

            <div className="lp-rail-label">
              <AccountChip compact className="w-full" />
            </div>

            {/* The mark, then two quiet icons: preferences behind the gear, and the fold. */}
            <div className="flex items-center gap-1 lp-rail-folded:flex-col lp-rail-folded:gap-1">
              <div className="lp-rail-label min-w-0 flex-1"><PoweredBy /></div>
              <button type="button" data-prefs-toggle onClick={() => setPrefsOpen(o => !o)} aria-label="Preferences" aria-expanded={prefsOpen} aria-haspopup="dialog" {...hint('Preferences')}
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                  prefsOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground')}>
                <Settings className={cn('h-[18px] w-[18px] transition-transform duration-500', prefsOpen && 'rotate-90')} />
              </button>
              <button onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} {...hint('Expand')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
                <Sidebar className={cn('h-[18px] w-[18px] transition-transform duration-300', collapsed && 'rotate-180')} />
              </button>
            </div>

            {/* The fine print, as in the page footer: hidden when folded. */}
            <nav aria-label="Legal" className="lp-rail-label flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-0.5 text-[11px] text-muted-foreground/75">
              <Link href="/admin" className="transition-colors hover:text-foreground">Admin</Link>
              {legal && <a href={legal.terms} className="transition-colors hover:text-foreground">Terms</a>}
              {legal && <a href={legal.privacy} className="transition-colors hover:text-foreground">Privacy</a>}
            </nav>
          </div>
        </div>
      </aside>

      {/* Preferences, opening beside the rail's foot. */}
      <AnimatePresence>
        {prefsOpen && (
          <motion.div ref={prefsBox} role="dialog" aria-label="Preferences"
            initial={{ opacity: 0, x: -10, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className="lp-surface lp-float fixed bottom-4 z-[61] hidden w-[320px] origin-bottom-left rounded-2xl p-3 backdrop-blur-2xl xl:block"
            style={{ left: (aside.current?.getBoundingClientRect().right ?? 276) + 12 }}>
            <div className="flex items-baseline justify-between px-2 pb-2.5 pt-1">
              <p className="font-display text-[15px] font-bold">Preferences</p>
              <p className="text-[11px] text-muted-foreground">This browser only</p>
            </div>
            <PreferencesPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The folded rail's labels. */}
      <AnimatePresence>
        {tip && (
          <motion.div key={tip.label} role="tooltip" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.12 }}
            className="pointer-events-none fixed z-[61] hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[12px] font-semibold text-background shadow-lg xl:block"
            style={{ top: tip.y, y: '-50%', left: (aside.current?.getBoundingClientRect().right ?? 92) + 12 }}>
            {tip.label}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
