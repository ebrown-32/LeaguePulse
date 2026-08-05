'use client';

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
 * The transform is small and settles at zero — framer clears it to
 * `transform: none` at rest, so it never becomes a containing block for the
 * `position: fixed` modals that render inside pages.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
