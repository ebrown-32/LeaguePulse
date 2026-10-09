import { Metadata } from 'next';
import { Suspense } from 'react';
import AnalyticsView from './AnalyticsView';

export const metadata: Metadata = {
  title: 'Analytics | LeaguePulse',
  description: 'Build your own reports from every game, pick and move in league history.',
};

export default function AnalyticsPage() {
  // Suspense because the view reads the URL for shared reports and links.
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  );
}
