import { Database } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
  return (
    <PageLayout
      title="League History"
      subtitle="Stats, records, and insights."
      icon={<Database className="h-6 w-6 text-primary" />}
    >
      <EnhancedHistoryView />
    </PageLayout>
  );
} 