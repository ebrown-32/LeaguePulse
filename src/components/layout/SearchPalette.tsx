'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tucked-away search.
 *
 * Opens on the magnifier, on Cmd/Ctrl-K, or on "/" from anywhere that is not a
 * text field. It searches destinations and the league's own people, so
 * "krock" jumps straight to that manager's team page rather than to a page
 * that happens to mention them.
 *
 * Everything is matched client side against a small index: a league has a few
 * dozen searchable things, and a round trip per keystroke to search them would
 * be slower and worse.
 */

export interface SearchEntry {
  id: string;
  label: string;
  sub?: string;
  href: string;
  group: string;
  /** Extra text that should match but need not be displayed. */
  keywords?: string;
}

interface Props {
  /** Pages, supplied by the navbar so there is one list of destinations. */
  pages: SearchEntry[];
}

/**
 * Subsequence match, the behaviour people expect from this kind of box:
 * "wkrp" finds "Weekly Report". Returns a score, lower being better, or null.
 */
function fuzzyScore(needle: string, haystack: string): number | null {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 0;

  const direct = h.indexOf(n);
  // A real substring always beats a scattered subsequence, and matching at a
  // word boundary beats matching mid-word.
  if (direct === 0) return 0;
  if (direct > 0) return h[direct - 1] === ' ' ? 1 : 2;

  let hi = 0, score = 10, lastHit = -1;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found === -1) return null;
    // Consecutive characters are worth more than scattered ones.
    if (lastHit >= 0) score += found - lastHit - 1;
    lastHit = found;
    hi = found + 1;
  }
  return score;
}

export default function SearchPalette({ pages }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [league, setLeague] = useState<SearchEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The league's teams and managers, fetched once on first open so the
  // palette costs nothing until someone actually uses it.
  useEffect(() => {
    if (!open || league.length) return;
    fetch('/api/search-index')
      .then(r => r.json())
      .then(d => setLeague(d.entries ?? []))
      .catch(() => { /* pages still work without it */ });
  }, [open, league.length]);

  const entries = useMemo(() => [...pages, ...league], [pages, league]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return pages.slice(0, 8);
    }
    return entries
      .map(e => {
        const target = `${e.label} ${e.sub ?? ''} ${e.keywords ?? ''}`;
        const score = fuzzyScore(query.trim(), target);
        return score === null ? null : { entry: e, score };
      })
      .filter((r): r is { entry: SearchEntry; score: number } => r !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map(r => r.entry);
  }, [query, entries, pages]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const go = useCallback((entry: SearchEntry | undefined) => {
    if (!entry) return;
    close();
    router.push(entry.href);
  }, [close, router]);

  // Global shortcuts. "/" is ignored while typing somewhere else, otherwise it
  // would swallow the character in every input on the site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      );
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === '/' && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  let lastGroup = '';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search"
        title="Search (Cmd K)"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Search className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            // Above the chat launcher, which sits at z-[72].
            className="fixed inset-0 z-[80] flex items-start justify-center bg-background/70 p-4 pt-[12vh] backdrop-blur-sm"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center gap-2.5 border-b border-border px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Search pages, teams and managers"
                  aria-label="Search"
                  // 16px so iOS does not zoom the viewport on focus.
                  className="w-full bg-transparent py-3.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-sm"
                />
                <button
                  onClick={close}
                  aria-label="Close search"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div ref={listRef} className="max-h-[52vh] overflow-y-auto overscroll-contain p-1.5">
                {results.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Nothing matches &ldquo;{query}&rdquo;.
                  </p>
                )}
                {results.map((r, i) => {
                  const header = r.group !== lastGroup ? r.group : null;
                  lastGroup = r.group;
                  return (
                    <div key={r.id}>
                      {header && (
                        <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {header}
                        </p>
                      )}
                      <button
                        data-idx={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          i === active ? 'bg-primary/10' : 'hover:bg-muted/50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium',
                            i === active ? 'text-primary' : 'text-foreground')}>
                            {r.label}
                          </span>
                          {r.sub && (
                            <span className="block truncate text-[11px] text-muted-foreground">{r.sub}</span>
                          )}
                        </span>
                        {i === active && (
                          <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="hidden items-center gap-3 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground sm:flex">
                <span><kbd className="rounded border border-border px-1">↑</kbd> <kbd className="rounded border border-border px-1">↓</kbd> to move</span>
                <span><kbd className="rounded border border-border px-1">↵</kbd> to open</span>
                <span><kbd className="rounded border border-border px-1">esc</kbd> to close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
