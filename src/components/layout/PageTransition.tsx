'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

/**
 * Fades each route in on navigation.
 *
 * Deliberately enter-only (no AnimatePresence exit): in the App Router the
 * incoming page renders before the outgoing one unmounts, so exit animations
 * either double-render both routes or fight the streaming boundary. Keying a
 * plain motion.div on the pathname gives the same perceived polish with none
 * of that.
 *
 * Two things were making this feel choppy rather than smooth:
 *
 * 1. The page animated upward while the browser was separately scrolling to
 *    the top, because `scroll-behavior: smooth` was set globally. Two
 *    animations moving the same content in the same axis at once. The global
 *    smooth scroll is gone, and nothing here translates any more, so a scroll
 *    restoration has nothing to fight.
 * 2. No compositor hint, so a heavy route repainted the whole document on
 *    every frame of the fade. `will-change: opacity` while animating, dropped
 *    the instant it settles, keeps the layer for the fade and no longer.
 *
 * The fade is opacity only, and that is a constraint rather than a
 * simplification. `transform`, `filter` and `contain: paint` all make an
 * element a containing block for `position: fixed` descendants, which would
 * anchor the chat launcher, the search palette and every modal rendered
 * inside a page to this wrapper instead of the viewport. `opacity` creates a
 * stacking context but never a containing block, so it is the one property
 * here that is safe to animate on a wrapper around arbitrary page content.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const systemReduce = useReducedMotion();
  // The admin's Motion setting is published on <html> by the root layout, so
  // it applies without threading theme state through every client component.
  const [adminReduce, setAdminReduce] = useState(false);
  useEffect(() => {
    setAdminReduce(document.documentElement.dataset.motion === 'reduced');
  }, []);
  const reduceMotion = systemReduce || adminReduce;

  const [animating, setAnimating] = useState(true);
  const first = useRef(true);

  // Scroll to the top synchronously on a route change, before paint, so the
  // new page never appears mid-scroll. Next does this too, but on a dynamic
  // route it can land after the fade has started.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    setAnimating(true);
  }, [pathname]);

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0.12 : 0.26,
        // Fast out of the gate, long gentle settle. The old curve spent its
        // first frames barely moving, which read as a stall before the fade.
        ease: [0.16, 1, 0.3, 1],
      }}
      onAnimationComplete={() => setAnimating(false)}
      style={{ willChange: animating ? 'opacity' : undefined }}
    >
      {children}
    </motion.div>
  );
}
