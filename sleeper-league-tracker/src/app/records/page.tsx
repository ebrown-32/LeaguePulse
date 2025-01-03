import { ChartBarIcon } from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/layout/PageLayout';
import StatsView from './StatsView';
import { getNFLState } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const nflState = await getNFLState();

  return (
    <PageLayout
      title="League Records"
      subtitle="Season statistics and records for all teams"
      icon={<ChartBarIcon className="h-6 w-6 text-gray-400" />}
    >
      <StatsView currentWeek={nflState.week} />
    </PageLayout>
  );
} 