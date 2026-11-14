import type { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { leagueConfigured } from '@/config/league';
import { leagueDisplayName } from '@/lib/leagueName';
import PickemView from './PickemView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pick\'em',
  description: 'Every week, every manager calls the league\'s other games. A season-long table, a lock of the week, and the Pick\'em Cup at the end of it.',
};

export default async function PickemPage() {
  if (!(await leagueConfigured())) return <ErrorMessage title="Pick'em" message="No league configured" />;
  const league = await leagueDisplayName().catch(() => '');
  return (
    <PageLayout title="Pick'em" subtitle="Call the league's other games every week. A point a right pick, double for your lock, a bonus for calling an upset. Top of the table at the end of the regular season lifts the Pick'em Cup.">
      <PickemView league={league} />
    </PageLayout>
  );
}
