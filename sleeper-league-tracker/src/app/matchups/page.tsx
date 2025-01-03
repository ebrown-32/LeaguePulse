import { UserGroupIcon } from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/layout/PageLayout';
import MatchupsView from './MatchupsView';

export const dynamic = 'force-dynamic';

export default async function MatchupsPage() {
  return (
    <PageLayout
      title="Matchups"
      subtitle="View weekly game results."
      icon={<UserGroupIcon className="h-6 w-6 text-gray-400" />}
    >
      <MatchupsView />
    </PageLayout>
  );
} 