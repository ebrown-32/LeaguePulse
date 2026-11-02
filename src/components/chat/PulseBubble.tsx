/**
 * The assistant's mark: a speech bubble with a heartbeat through it, LeaguePulse's own logo in
 * the app's duotone register (a soft tint under a full outline, as in components/icons).
 *
 *   still     drawn and at rest
 *   idle      the beat re-traces every few seconds, like a monitor (the launcher)
 *   thinking  the beat runs continuously (while an answer is on its way)
 *
 * The trace is CSS (globals.css .lp-beat), and stops for reduced motion.
 */

import { cn } from '@/lib/utils';

export default function PulseBubble({ className, motion = 'still' }: { className?: string; motion?: 'still' | 'idle' | 'thinking' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn('shrink-0', className)}>
      <path
        d="M6 3.75h12A3.25 3.25 0 0 1 21.25 7v8A3.25 3.25 0 0 1 18 18.25h-6.4l-4.1 3.1a.6.6 0 0 1-.96-.48v-2.62H6A3.25 3.25 0 0 1 2.75 15V7A3.25 3.25 0 0 1 6 3.75Z"
        fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round"
      />
      <path
        d="M5.75 11.25h2.9l1.55-3.5 2.6 7 1.75-3.5h3.7"
        pathLength={1}
        stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
        className={cn(motion === 'idle' && 'lp-beat lp-beat-idle', motion === 'thinking' && 'lp-beat lp-beat-run')}
      />
    </svg>
  );
}
