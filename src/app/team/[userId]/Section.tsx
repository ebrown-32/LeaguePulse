'use client';

/**
 * A collapsible section of a franchise page: a quiet header with a one-line
 * summary while closed, the content sliding open beneath it. Closed by
 * default; each visitor's open sections are remembered per page.
 */

import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from '@/components/icons';
import { cn } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;
const key = (scope: string, id: string) => `lp_section:${scope}:${id}`;

export function Section({ scope, id, icon: Icon, title, summary, index = 0, defaultOpen = false, children }: {
  /** Which page's memory this section belongs to ("team", "manage"). */
  scope: string; id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** What the section holds, in a line, shown beside the title. */
  summary?: React.ReactNode;
  /** Its place in the list, to stagger the entrance. */
  index?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  useEffect(() => {
    try { const v = localStorage.getItem(key(scope, id)); if (v !== null) setOpen(v === '1'); } catch { /* ignore */ }
  }, [scope, id]);
  const toggle = () => setOpen(o => {
    try { localStorage.setItem(key(scope, id), o ? '0' : '1'); } catch { /* ignore */ }
    return !o;
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.25 + Math.min(index, 8) * 0.06 }}
      className={cn('overflow-hidden rounded-2xl border bg-card transition-colors duration-300',
        open ? 'border-border shadow-[0_8px_30px_-12px_rgba(0,0,0,0.18)]' : 'border-border/70 hover:border-border')}
    >
      <button onClick={toggle} aria-expanded={open} aria-controls={panel}
        className="group flex w-full items-center gap-3.5 px-4 py-3.5 text-left sm:px-5 sm:py-4">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300',
          open ? 'bg-[var(--team,hsl(var(--primary)))] text-white' : 'bg-muted text-muted-foreground group-hover:text-foreground')}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight text-foreground">{title}</span>
          {summary && (
            <motion.span initial={false} animate={{ opacity: open ? 0.6 : 1 }} className="block truncate text-[12.5px] text-muted-foreground">{summary}</motion.span>
          )}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.35, ease: EASE }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panel} key="panel"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.45, ease: EASE }, opacity: { duration: 0.25 } }}>
            <motion.div initial={{ y: -8 }} animate={{ y: 0 }} exit={{ y: -8 }} transition={{ duration: 0.4, ease: EASE }}
              className="border-t border-border/60 px-4 pb-5 pt-4 sm:px-5">
              {children}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** The sections of a page, spaced as one list. */
export function Sections({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2.5">{children}</div>;
}
