import { Receipt } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import TransactionsView from './TransactionsView';

export const dynamic = 'force-dynamic';

export default function TransactionsPage() {
  return (
    <PageLayout
      title="Transactions"
      subtitle="Every trade, waiver, and move."
      icon={<Receipt className="h-5 w-5" />}
    >
      <TransactionsView />
    </PageLayout>
  );
}
