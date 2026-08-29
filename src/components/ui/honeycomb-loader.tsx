'use client';

import { cn } from '@/lib/utils';

/**
 * The honeycomb loader.
 *
 * Seven hexagons pulsing in sequence. The cells are built from a rectangle
 * plus two CSS triangles, and they inherit `currentColor`, so the loader takes
 * whatever colour it is placed in rather than shipping its own.
 *
 * The markup is deliberately bare divs: each cell is decoration with no
 * meaning of its own, and the wrapper carries the accessible label for all of
 * them. Size is driven by the `--honeycomb-size` custom property so one set of
 * geometry serves every use.
 */
export function HoneycombLoader({
  className,
  label = 'Loading',
  style,
}: {
  className?: string;
  /** Announced to screen readers. Pass null to hide it entirely. */
  label?: string | null;
  /** Set `--honeycomb-size` here to resize the whole mark from one number. */
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn('honeycomb', className)}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
    >
      {/* Seven cells: six around one. Order matters, the animation delays in
          the stylesheet are keyed to nth-child. */}
      {Array.from({ length: 7 }, (_, i) => <div key={i} />)}
    </div>
  );
}

export default HoneycombLoader;
