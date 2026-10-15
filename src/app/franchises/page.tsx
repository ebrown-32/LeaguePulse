import { PageLayout } from '@/components/layout/PageLayout';
import FranchisesView from './FranchisesView';

export const metadata = { title: 'Franchises | League Pulse' };

export default function FranchisesPage() {
  return (
    <PageLayout title="Franchises" subtitle="Every manager who has played in the league, across every season.">
      <FranchisesView />
    </PageLayout>
  );
}
