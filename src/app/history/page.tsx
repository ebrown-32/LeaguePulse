import { Database } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';
import { getNFLState } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const nflState = await getNFLState();

  return (
    <PageLayout
      title="League History"
      subtitle="Stats, records, and insights."
      icon={<Database className="h-6 w-6 text-primary" />}
    >
      <EnhancedHistoryView currentWeek={nflState.week} />
    </PageLayout>
  );
} 