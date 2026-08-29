'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * A quiet explanation attached to a label.
 *
 * The trigger is the label itself with a dotted underline, which reads as
 * "there is more here" without adding an icon to every metric on the page. The
 * existing Radix tooltip was not usable for this: it hardcodes a grey
 * background that ignores the palette, and it opens on hover only, so on a
 * phone the explanations were unreachable.
 *
 * Opens on hover and focus for a pointer, on tap for touch, and closes on
 * Escape or a click elsewhere.
 */
export default function Hint({
  label,
  children,
  className,
  side = 'top',
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  /**
   * Whether this device opens hints by hovering.
   *
   * On a mouse, hover already opened the hint by the time the click lands, so
   * a click that toggles closes what the user just pointed at. Click only
   * toggles where there is no hover to do the job.
   */
  const hoverCapable = () =>
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen(o => (hoverCapable() ? true : !o))}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-current/40 text-left leading-tight transition-colors hover:border-current"
      >
        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === 'top' ? 2 : -2 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            // Centred on the trigger and clamped to the viewport width, so a
            // hint on a metric at the right edge of a card does not run off.
            className={cn(
              'pointer-events-none absolute left-1/2 z-50 w-[15rem] max-w-[70vw] -translate-x-1/2',
              'rounded-lg border border-border bg-card p-2.5 text-[11px] font-normal leading-relaxed',
              'text-muted-foreground shadow-xl',
              side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            )}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
