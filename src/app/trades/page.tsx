import { PageLayout } from '@/components/layout/PageLayout';
import TradeFinder from './TradeFinder';

export const metadata = { title: 'Trade Finder | League Pulse' };

export default function TradesPage() {
  return (
    <PageLayout title="Trade Finder" subtitle="Trade ideas, just to get you started. Swipe to see the next one." className="max-w-3xl">
      <TradeFinder />
      {/* FantasyCalc's terms: a visible link on every page showing their values or anything
          derived from them, in the HTML the server sends (lib/trades/values). */}
      <p className="text-center text-xs text-muted-foreground">
        Trade values from{' '}
        <a href="https://fantasycalc.com" target="_blank" rel="noopener" className="font-medium text-foreground underline underline-offset-2">FantasyCalc</a>
        , projections from Sleeper.
      </p>
    </PageLayout>
  );
}
