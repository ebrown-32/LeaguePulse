'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HoneycombLoader from '@/components/ui/honeycomb-loader';

/**
 * The opening splash.
 *
 * Shows on a real page load and never on a client-side route change, which is
 * what "every time the app is opened" means: the root layout only mounts on a
 * full document load, so this needs no session flag to behave.
 *
 * The dwell is quantised to whole animation cycles. The honeycomb takes 2.1s
 * to travel the ring and the last cell starts 0.6s in, so leaving at any other
 * moment cuts the pulse mid-flight and looks broken. Holding to a cycle
 * boundary is the whole point of "perfectly timed".
 */

/** One full pass of the honeycomb, matching the CSS animation. */
const CYCLE_MS = 2100;
/** The last cell's animation-delay, so a cycle is only complete after this. */
const STAGGER_MS = 600;
/** How long the mark stays before fading. One complete pass, then out. */
const HOLD_MS = CYCLE_MS + STAGGER_MS;

export default function AppLoader({ leagueName }: { leagueName?: string | null }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Anyone who has asked for less motion gets a much shorter hold: a
    // deliberate two second wait is exactly what that preference is about.
    const reduced =
      document.documentElement.dataset.motion === 'reduced' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const t = setTimeout(() => setDone(true), reduced ? 400 : HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  // The overlay is removed from the tree once it has gone, so it can never
  // intercept a click on the app behind it.
  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="app-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-10">
            <HoneycombLoader
              label="Loading"
              // Larger than the inline default: this is the only thing on screen.
              style={{ ['--honeycomb-size' as string]: '28px' }}
            />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground"
            >
              {leagueName?.trim() || 'League Pulse'}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
