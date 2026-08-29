'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls, useMotionValue } from 'framer-motion';
import { X, ArrowUp, Sparkles, Maximize2, Minimize2, GripHorizontal, Eraser } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { cn } from '@/lib/utils';

/**
 * League chat assistant.
 *
 * Streams from /api/chat, which grounds every answer in the real league brief
 * and can reach Anthropic's server-side web search for wider NFL questions.
 *
 * Markdown is rendered with Streamdown rather than dumped as preformatted text:
 * the model emits bold, lists and tables, which previously showed as literal
 * asterisks. Streamdown also parses half-finished blocks, so a streaming
 * response never flickers through broken syntax.
 */

interface Msg { role: 'user' | 'assistant'; content: string }

/** Mirrors the server cap so the limit is visible before submitting. */
const MAX_INPUT = 2000;

/**
 * Waiting state.
 *
 * With tool calling the model often spends several seconds fetching league
 * data before emitting a single token, and three static dots read as a hang.
 * The note escalates with elapsed time so a long wait still feels like
 * progress, and every string is true of what is actually happening.
 */
function ThinkingBubble() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const note =
    elapsed < 3 ? 'Thinking' :
    elapsed < 8 ? 'Checking the league record' :
    elapsed < 16 ? 'Digging through the data' :
    'Still working on it';

  return (
    <div className="flex items-center gap-2.5">
      <motion.span
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
        className="text-primary"
      >
        <Sparkles className="h-4 w-4" />
      </motion.span>
      <span className="text-[11px] text-muted-foreground">{note}</span>
      <span className="inline-flex gap-1">
        {[0, 1, 2].map(d => (
          <motion.span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-primary/70"
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </span>
    </div>
  );
}

const SUGGESTIONS = [
  'Who has the strongest roster right now?',
  'What were the biggest trades recently?',
  'Who won the championship last season?',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('Captain Mike');

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();
  // Drag offset from the docked position. Motion values rather than state so
  // dragging does not re-render the transcript on every pointer move.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [bounds, setBounds] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  /** Desktop gets the floating, draggable panel; touch gets a bottom sheet. */
  const [isDesktop, setIsDesktop] = useState(true);
  /** Height of the on-screen keyboard, so the sheet can sit above it. */
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // iOS does not resize the layout viewport when the keyboard opens, so a
  // bottom-anchored sheet ends up underneath it. visualViewport reports the
  // genuinely visible area; the difference is the keyboard.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !open) return;
    const sync = () => setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, [open]);

  /**
   * Stop iOS scaling the page while the sheet is open.
   *
   * The usual trigger is an input under 16px, which is already handled: the
   * textarea computes to exactly 16px. But WebKit also scales to a focused
   * field inside a position:fixed container when the keyboard opens, and no
   * font size prevents that. Pinning maximum-scale while the sheet is open,
   * and restoring the original meta on close, blocks it without taking
   * pinch-zoom away from the rest of the app.
   *
   * Desktop is untouched; it has neither the behaviour nor the keyboard.
   */
  useEffect(() => {
    if (!open || isDesktop) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content') ?? '';
    meta.setAttribute('content', `${original}, maximum-scale=1, user-scalable=no`);
    return () => { meta.setAttribute('content', original); };
  }, [open, isDesktop]);

  // The page behind a full-height sheet must not scroll with it.
  useEffect(() => {
    if (!open || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isDesktop]);

  // A dragged-away panel that reappears in the same odd spot next time feels
  // broken, and a stale offset in fullscreen pushed the panel off-centre and
  // over the scrim. Reset whenever it opens, closes, or changes mode.
  useEffect(() => {
    x.set(0); y.set(0);
    if (!open) setFull(false);
  }, [open, full, x, y]);

  // Keep the panel fully on screen. Measured from the real docked rect, so it
  // stays correct across breakpoints and viewport sizes.
  const measureBounds = useCallback(() => {
    const el = panelRef.current;
    if (!el || full) return;
    const prevX = x.get(), prevY = y.get();
    x.set(0); y.set(0);
    const r = el.getBoundingClientRect();
    const M = 8; // keep a small gutter at every edge
    setBounds({
      left: -Math.max(r.left - M, 0),
      right: Math.max(window.innerWidth - r.right - M, 0),
      top: -Math.max(r.top - M, 0),
      bottom: Math.max(window.innerHeight - r.bottom - M, 0),
    });
    x.set(prevX); y.set(prevY);
  }, [full, x, y]);

  useEffect(() => {
    if (!open || full) return;
    // The entry spring applies its own transform, so measuring immediately
    // reads a mid-animation rect and the clamp comes out wrong. Wait for it
    // to settle, then measure.
    const t = setTimeout(measureBounds, 400);
    window.addEventListener('resize', measureBounds);
    return () => { clearTimeout(t); window.removeEventListener('resize', measureBounds); };
  }, [open, full, measureBounds]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (full) setFull(false); else setOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, full]);

  // Dismiss on outside click. In fullscreen the scrim handles this instead.
  useEffect(() => {
    if (!open || full) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t)) return;
      if (t.closest?.('[data-chat-launcher]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, full]);

  /**
   * Autofocus on desktop only.
   *
   * This was the actual cause of the mobile zoom. Focusing the textarea the
   * moment the sheet opens makes iOS raise the keyboard and scroll-and-scale
   * to a field inside a position:fixed container, so simply tapping the
   * launcher zoomed the page before anything had been typed. On touch the user
   * taps the input when they are ready, which is the expected behaviour for a
   * sheet anyway.
   */
  useEffect(() => {
    if (open && isDesktop) inputRef.current?.focus();
  }, [open, full, isDesktop]);

  // The name is admin-configurable, so read it rather than hardcoding.
  useEffect(() => {
    fetch('/api/ai/assistant')
      .then(r => r.json())
      .then(d => d?.name && setName(d.name))
      .catch(() => {});
  }, []);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    setError('');
    setInput('');
    const next: Msg[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Drop any empty assistant turn from an aborted stream; providers
        // reject empty message content.
        body: JSON.stringify({ messages: next.filter(m => m.content.trim()) }),
      });

      // A deployment without the chat route answers with the app shell rather
      // than 404, so check the content type: streaming HTML into the panel
      // would look like a model failure instead of a missing endpoint.
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.includes('text/html')) {
        setError('The chat endpoint is not available on this deployment. It may need a redeploy.');
        setBusy(false);
        return;
      }
      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        setError(
          detail?.error ??
          (res.status === 429
            ? 'Rate limit reached. Try again in a little while.'
            : res.status === 503
              ? 'The assistant is not configured on this deployment.'
              : `The assistant is unavailable right now (HTTP ${res.status}).`),
        );
        setBusy(false);
        return;
      }

      setMessages(m => [...m, { role: 'assistant', content: '' }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (err) {
      setError(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'You appear to be offline.'
          : 'Could not reach the server. If you are running locally, check the dev server is up.',
      );
      console.error('[chat]', err);
    } finally {
      setBusy(false);
    }
  }, [messages, busy]);

  const lastIndex = messages.length - 1;

  return (
    <>
      {/* Launcher */}
      <motion.button
        data-chat-launcher
        onClick={() => setOpen(o => !o)}
        aria-label={open ? `Close ${name}` : `Ask ${name}`}
        whileTap={{ scale: 0.92 }}
        className={cn(
          'group fixed bottom-4 right-4 z-[72] flex h-14 w-14 items-center justify-center rounded-full sm:h-12 sm:w-12',
          // A gradient rather than a flat fill, with a hairline lit edge, so
          // it catches the eye the way the glass cards do.
          'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground',
          'ring-1 ring-inset ring-white/20',
          'shadow-lg shadow-primary/30',
          'transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40',
          // The sheet reaches the bottom edge on touch, so a floating launcher
          // lands squarely on top of the input. The header close button is the
          // way out there; on desktop the launcher sits clear of the panel.
          open && !isDesktop && 'hidden',
        )}
      >
        {/* A slow halo, so the launcher reads as awake without demanding
            attention. Held still when motion is turned down, where a pulsing
            element in the corner of every page is exactly what is unwanted. */}
        {!open && (
          <span
            aria-hidden
            className="lp-chat-halo pointer-events-none absolute inset-0 rounded-full bg-primary/25"
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'x' : 'spark'}
            initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            {open
              ? <X className="h-5 w-5" />
              : <Sparkles className="h-6 w-6 transition-transform duration-300 group-hover:rotate-12 sm:h-5 sm:w-5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && full && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[69] bg-black/60 backdrop-blur-sm"
          />
        )}

        {open && (
          <motion.div
            key="panel"
            ref={panelRef}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            // Only the header starts a drag, so selecting text in the
            // transcript does not fling the panel across the screen.
            // Dragging is a desktop affordance; on touch it fights scrolling.
            drag={!full && isDesktop}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={bounds}
            style={{
              ...(full || !isDesktop ? {} : { x, y }),
              // Lift above the on-screen keyboard rather than hiding under it.
              ...(keyboard && !isDesktop && !full
                ? { bottom: keyboard, height: `calc(75dvh - ${keyboard}px)` }
                : {}),
            }}
            className={cn(
              'fixed z-[70] flex flex-col overflow-hidden border border-border bg-card shadow-2xl',
              full
                // Edge to edge on phones, inset on larger screens.
                ? 'inset-0 rounded-none sm:inset-8 sm:rounded-2xl lg:inset-x-[14vw] lg:inset-y-10'
                : cn(
                    // Touch: a bottom sheet, where a thumb already is. dvh
                    // rather than vh so mobile browser chrome is accounted for.
                    'inset-x-0 bottom-0 h-[75dvh] rounded-t-2xl border-x-0 border-b-0',
                    // Desktop: the floating card.
                    'sm:inset-x-auto sm:bottom-20 sm:right-4 sm:h-auto sm:max-h-[32rem] sm:w-96',
                    'sm:rounded-2xl sm:border',
                  ),
            )}
            role="dialog"
            aria-label={name}
          >
            <div
              onPointerDown={e => { if (!full && isDesktop) dragControls.start(e); }}
              className={cn(
                'relative flex select-none items-center gap-2 border-b border-border px-3',
                // Taller on touch so the controls clear a 44px target.
                'py-3.5 sm:py-2.5',
                !full && isDesktop && 'cursor-grab active:cursor-grabbing',
              )}
            >
              {/* Grab bar: the standard "this is a sheet" affordance. */}
              {!full && !isDesktop && (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-muted-foreground/30"
                />
              )}
              <Sparkles className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate text-xs font-bold uppercase tracking-widest text-foreground">
                {name}
              </span>
              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                AI
              </span>

              <div className="ml-auto flex items-center gap-0.5">
                {!full && isDesktop && (
                  <GripHorizontal className="mr-1 hidden h-3.5 w-3.5 text-muted-foreground/40 sm:block" aria-hidden="true" />
                )}
                {messages.length > 0 && (
                  <button
                    onClick={() => { setMessages([]); setError(''); }}
                    aria-label="Clear conversation"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setFull(f => !f)}
                  aria-label={full ? 'Exit full screen' : 'Full screen'}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
                >
                  {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-7 sm:w-7"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {!messages.length && (
                <div className={cn('space-y-3', full && 'mx-auto max-w-2xl pt-6')}>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Ask about this league&apos;s standings, rosters, trades and history, or about
                    the wider NFL. League answers come from the real record; NFL answers come
                    from a web search.
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="block w-full rounded-lg border border-border px-3 py-3 text-left text-[13px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary sm:py-2 sm:text-[11px]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={cn('space-y-3', full && 'mx-auto w-full max-w-2xl')}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      'rounded-xl px-3 py-2 text-[13px] leading-relaxed sm:text-xs',
                      m.role === 'user'
                        ? 'ml-auto max-w-[85%] whitespace-pre-wrap bg-primary text-primary-foreground'
                        : 'max-w-[95%] border border-border bg-muted/40 text-foreground',
                    )}
                  >
                    {m.role === 'user' ? m.content : (
                      m.content ? (
                        <div className="chat-md">
                          <Streamdown isAnimating={busy && i === lastIndex}>{m.content}</Streamdown>
                        </div>
                      ) : <ThinkingBubble />
                    )}
                  </motion.div>
                ))}

                {/* The assistant bubble only exists once response headers
                    arrive, so without this the whole request round trip showed
                    nothing at all: exactly the wait that needs covering. */}
                {busy && messages[messages.length - 1]?.role === 'user' && (
                  <div className="max-w-[95%] rounded-xl border border-border bg-muted/40 px-3 py-2">
                    <ThinkingBubble />
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-500">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border p-2">
              <div className={cn('relative flex items-end gap-2', full && 'mx-auto w-full max-w-2xl')}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                  }}
                  rows={1}
                  maxLength={MAX_INPUT}
                  placeholder={`Ask ${name}…`}
                  enterKeyHint="send"
                  autoComplete="off"
                  autoCorrect="on"
                  className={cn(
                    'max-h-32 flex-1 resize-none rounded-lg border border-border bg-background px-3',
                    // 16px is the threshold below which iOS zooms on focus.
                    // Anything smaller here and the page jumps every time the
                    // keyboard opens.
                    'py-2.5 text-base sm:py-2 sm:text-xs',
                    'min-h-[2.75rem] sm:min-h-[2.25rem]',
                    'text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none',
                  )}
                />
                {input.length > MAX_INPUT * 0.8 && (
                  <span className="absolute bottom-1 right-14 text-[10px] tabular-nums text-muted-foreground">
                    {MAX_INPUT - input.length}
                  </span>
                )}
                <button
                  onClick={() => send(input)}
                  disabled={busy || !input.trim()}
                  aria-label="Send"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40 sm:h-9 sm:w-9"
                >
                  <ArrowUp className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
