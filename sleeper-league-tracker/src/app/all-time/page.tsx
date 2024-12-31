import { ClockIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '@/components/ui/PageHeader';
import { getLeagueInfo } from '@/lib/api';
import { LEAGUE_ID } from '@/config/league';
import HistoryView from '@/app/all-time/HistoryView';

export default async function HistoryPage() {
  const league = await getLeagueInfo(LEAGUE_ID);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="space-y-6 pb-20 md:pb-8">
        <PageHeader
          icon={<ClockIcon className="h-6 w-6 text-gray-400" />}
          title="League History"
          subtitle={`Since ${league.previous_league_id ? 'Season 2022' : league.season}`}
        />
        <HistoryView league={league} />
      </div>
    </div>
  );
} 