import { ClockIcon } from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/layout/PageLayout';
import HistoryView from './HistoryView';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export default async function AllTimePage() {
  return (
    <PageLayout
      title="League History"
      subtitle="View historical performance and records"
      icon={<ClockIcon className="h-6 w-6 text-gray-400" />}
    >
      <HistoryView />
    </PageLayout>
  );
} 