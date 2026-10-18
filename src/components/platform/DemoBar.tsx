/**
 * The demo site's strip under the navigation (lib/demo): what this league is, and the way to
 * get one of your own. On every page of the demo, never anywhere else.
 */

import { ArrowRight } from '@/components/icons';

export default function DemoBar({ productUrl }: { productUrl: string }) {
  return (
    <div className="border-b border-primary/20 bg-gradient-to-r from-primary/12 via-primary/6 to-transparent">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary-foreground">Demo</span>
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/80">
          <span className="sm:hidden">Made-up league, real games.</span>
          <span className="hidden sm:inline">A made-up league of ten managers with real NFL players, every point scored from the real games, live on Sundays. Click around: it all works.</span>
        </p>
        <a href={`${productUrl}/?from=demo`}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-3 py-1 text-[12px] font-semibold text-background transition hover:opacity-90">
          <span className="sm:hidden">Get yours</span>
          <span className="hidden sm:inline">Get LeaguePulse for your league</span>
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </div>
  );
}
