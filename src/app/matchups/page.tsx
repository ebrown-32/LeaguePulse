import { Swords } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import MatchupsView from './MatchupsView';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  return (
    <PageLayout
      title="Matchups"
      subtitle="The slate."
      icon={<Swords className="h-6 w-6" />}
    >
      <MatchupsView />
    </PageLayout>
  );
}
