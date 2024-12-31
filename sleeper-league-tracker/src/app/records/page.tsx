import { ChartBarIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/ui/PageHeader';
import { getNFLState } from '@/lib/api';
import StatsView from '@/app/records/StatsView';

export default async function StatsPage() {
  const nflState = await getNFLState();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-6 pb-20 md:pb-8">
        <PageHeader
          icon={<ChartBarIcon className="h-6 w-6 text-gray-400" />}
          title="Season Stats"
          subtitle={`Through Week ${nflState.week}`}
        />
        <StatsView currentWeek={nflState.week} />
      </div>
    </div>
  );
} 