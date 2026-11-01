'use client';

/**
 * Framer Motion's animations follow the site's motion setting: the visitor's (lib/prefs), else the
 * league's. CSS reads the same answer from <html data-motion>; this is the JavaScript half.
 */

import { MotionConfig } from 'framer-motion';
import { usePrefs } from '@/lib/prefs';

export default function MotionPrefs({ league, children }: { league: 'full' | 'reduced'; children: React.ReactNode }) {
  const reduced = (usePrefs().motion ?? league) === 'reduced';
  return <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>;
}
