import { productDisplay } from '@/components/platform/fonts';
import { cn } from '@/lib/utils';

import { BRAND, markFor } from '@/lib/brandMark';

/**
 * LeaguePulse's own mark and wordmark, for league sites: "Turf Line" (lib/brandMark), a
 * turf-green tile with a heartbeat drawn across it like a yard line and an orange live dot, and
 * the wordmark in wide capitals, "League" in the text color and "Pulse" in turf. League sites
 * wear the league's own theme, so the brand brings its own colors and typeface (Archivo) rather
 * than borrowing the site's accent.
 */

export function LeaguePulseMark({ size = 22, className }: { size?: number; className?: string }) {
  const d = markFor(size);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="14" fill={BRAND.turf} />
      <path d={d.line} stroke={BRAND.paper} strokeWidth={d.stroke} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={d.dot.cx} cy={d.dot.cy} r={d.dot.r} fill={BRAND.signal} />
    </svg>
  );
}

/** `size` is the old condensed wordmark's; the wide capitals are set a little smaller to fit the same room. */
export function LeaguePulseWordmark({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <span className={cn(productDisplay.variable, 'lp-wordmark text-foreground', className)} style={{ fontSize: Math.round(size * 0.78) }}>
      League <span className="text-[#0A7550] dark:text-[#3DD598]">Pulse</span>
    </span>
  );
}

/** The mark and the wordmark side by side. */
export function LeaguePulseLockup({ size = 22, text = 15, className }: { size?: number; text?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-foreground', className)}>
      <LeaguePulseMark size={size} />
      <LeaguePulseWordmark size={text} />
    </span>
  );
}
