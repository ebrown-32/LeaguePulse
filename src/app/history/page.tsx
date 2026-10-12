import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';
import { ringSeasons as getRingSeasons } from '@/lib/ringModels';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const ringSeasons = await getRingSeasons();
  return (
    <PageLayout
      title="League History"
      subtitle="Stats, records, and insights."
    >
      <EnhancedHistoryView ringSeasons={ringSeasons} />
    </PageLayout>
  );
} 