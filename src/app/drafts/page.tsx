
import { PageLayout } from '@/components/layout/PageLayout';
import DraftsView from './DraftsView';

export const dynamic = 'force-dynamic';

export default function DraftsPage() {
  return (
    <PageLayout
      title="Drafts"
      subtitle="Every pick, every round, every season."
    >
      <DraftsView />
    </PageLayout>
  );
}
