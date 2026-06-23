import { Sword } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import RivalryView from './RivalryView';
import { fetchRivalriesData } from '@/lib/rivalries';
import type { RivalriesResponse } from '@/app/api/rivalries/route';
import { INITIAL_LEAGUE_ID } from '@/config/league';

export const dynamic = 'force-dynamic';

export default async function RivalriesPage() {
  if (!INITIAL_LEAGUE_ID) {
    return (
      <ErrorMessage
        title="Failed to Load Rivalries"
        message="No league configured"
      />
    );
  }

  let data: RivalriesResponse | null = null;
  let errorMsg: string | null = null;

  try {
    data = await fetchRivalriesData();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load rivalry data';
  }

  if (errorMsg || !data) {
    return (
      <ErrorMessage
        title="Failed to Load Rivalries"
        message={errorMsg ?? 'Unknown error'}
      />
    );
  }

  return (
    <PageLayout
      title="Rivalry Tracker"
      subtitle="All-time head-to-head records across every season."
      icon={<Sword className="h-6 w-6 text-primary" />}
    >
      <RivalryView data={data} />
    </PageLayout>
  );
}
