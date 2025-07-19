import { ClockIcon } from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';
import { getNFLState } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const nflState = await getNFLState();

  return (
    <PageLayout
      title="League History"
      subtitle="Comprehensive stats, records, and insights"
      icon={<ClockIcon className="h-6 w-6 text-gray-400" />}
    >
      <EnhancedHistoryView currentWeek={nflState.week} />
    </PageLayout>
  );
} 