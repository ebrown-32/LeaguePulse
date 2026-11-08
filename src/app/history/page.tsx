import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';
import { ringSeasons as getRingSeasons } from '@/lib/ringModels';
import { leagueDisplayName } from '@/lib/leagueName';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const [ringSeasons, leagueName] = await Promise.all([getRingSeasons(), leagueDisplayName()]);
  return (
    <PageLayout
      title="League History"
      subtitle="Stats, records, and insights."
    >
      {/* Box scores read lineups from the league archive, a database a self-hosted site may not have. */}
      <EnhancedHistoryView ringSeasons={ringSeasons} leagueName={leagueName} boxScores={Boolean(process.env.DATABASE_URL?.trim())} />
    </PageLayout>
  );
} 