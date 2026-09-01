import { Suspense } from 'react';

import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingPage } from '@/components/ui/LoadingSpinner';
import TransactionsView from './TransactionsView';

export const dynamic = 'force-dynamic';

export default function TransactionsPage() {
  return (
    <PageLayout
      title="Transactions"
      subtitle="Every trade, waiver, and move."
    >
      {/* TransactionsView reads ?tx= via useSearchParams, which Next requires
          to sit inside a Suspense boundary. */}
      <Suspense fallback={<LoadingPage />}>
        <TransactionsView />
      </Suspense>
    </PageLayout>
  );
}
