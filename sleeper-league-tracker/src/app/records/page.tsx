import { PageHeader } from '@/components/ui/PageHeader';
import { getNFLState, getLeagueInfo } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import StatsView from '@/app/records/StatsView';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const [nflState, leagueId] = await Promise.all([
    getNFLState(),
    getCurrentLeagueId(),
  ]);

  const league = await getLeagueInfo(leagueId);

  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        title="League Records"
        subtitle="Season statistics and records for all teams"
        icon="chart"
      />
      <StatsView currentWeek={nflState.week} />
    </div>
  );
} 