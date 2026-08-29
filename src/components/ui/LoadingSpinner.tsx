'use client';

import HoneycombLoader from './honeycomb-loader';

export function LoadingSpinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-primary ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * A section or page waiting on data.
 *
 * The honeycomb rather than the spinner: this is the app's loading mark, and
 * it should be the same one whether the whole app is opening or one panel is
 * fetching. The spinner survives only for the few places a honeycomb cannot
 * go, namely inside a button, where its cells need roughly three times the
 * space of the box they are sized from.
 */
export function LoadingPage({ size = 18, className = 'min-h-[400px]' }: {
  /** Drives --honeycomb-size, so the whole mark scales from one number. */
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <HoneycombLoader style={{ ['--honeycomb-size' as string]: `${size}px` }} />
    </div>
  );
}

/**
 * The inline version, for a panel rather than a page.
 *
 * Padding is generous because the cells extend well past the element box: a
 * honeycomb in a tight container clips its own outer ring.
 */
export function LoadingBlock({ size = 14, className = '' }: {
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <HoneycombLoader style={{ ['--honeycomb-size' as string]: `${size}px` }} />
    </div>
  );
}
