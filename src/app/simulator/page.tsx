import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import SimulatorView from './SimulatorView';

export const metadata: Metadata = {
  title: 'Simulator',
  description:
    'Simulate the rest of the season, pin results, run single matchups, track the rookie draft order, and rewind trades to see how history would have changed.',
};

export const dynamic = 'force-dynamic';

export default function SimulatorPage() {
  return (
    <PageLayout
      title="Simulator"
      subtitle="Run the season ten thousand times, force results you want to test, and rewind old trades to see what would have happened."
    >
      <SimulatorView />
    </PageLayout>
  );
}
