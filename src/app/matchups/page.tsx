
import { PageLayout } from '@/components/layout/PageLayout';
import MatchupsView from './MatchupsView';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  return (
    <PageLayout
      title="Matchups"
      subtitle="The slate."
    >
      <MatchupsView />
    </PageLayout>
  );
}
