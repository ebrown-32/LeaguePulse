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
      {/* Box scores read lineups from the league archive, a database a self-hosted site may not have. */}
      <EnhancedHistoryView ringSeasons={ringSeasons} boxScores={Boolean(process.env.DATABASE_URL?.trim())} />
    </PageLayout>
  );
} 