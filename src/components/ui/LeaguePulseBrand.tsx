import { productDisplay } from '@/components/platform/fonts';
import { cn } from '@/lib/utils';

/**
 * LeaguePulse's own mark and wordmark, for league sites: the ink "L" with the
 * orange speech-bubble "P" carrying a white heartbeat, and the heavy condensed
 * wordmark, "League" in ink and "Pulse" in signal orange, as in the identity
 * guide (public/brand). League sites wear the league's own theme, so the brand
 * brings its colors and its typeface (Archivo) with it rather than borrowing
 * the site's; the "L" follows the text color, so it reads in dark mode too.
 */

const SIGNAL = '#EE5A2E';
const L = 'M7 20.5 L19.5 12.5 V44.5 H34 L39.5 54 H10 Q7 54 7 51 Z';
const P = 'M21.5 7.5 H41 C49.5 7.5 55.5 13.8 55.5 22.5 C55.5 31.2 49.5 37.5 41 37.5 H30 L22 45.5 V39 Q21.5 38.2 21.5 36.5 Z';
const PULSE = 'M25 22.5 H31 L33.6 16 L37.4 30 L40.6 19.5 L42.6 22.5 H50';

export function LeaguePulseMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <path d={L} fill="currentColor" />
      <path d={P} fill={SIGNAL} />
      <path d={PULSE} stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LeaguePulseWordmark({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <span className={cn(productDisplay.variable, 'lp-wordmark text-foreground', className)} style={{ fontSize: size }}>
      League<span style={{ color: SIGNAL }}>Pulse</span>
    </span>
  );
}

/** The mark and the wordmark side by side. */
export function LeaguePulseLockup({ size = 22, text = 15, className }: { size?: number; text?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-foreground', className)}>
      <LeaguePulseMark size={size} />
      <LeaguePulseWordmark size={text} />
    </span>
  );
}
