import { PageLayout } from '@/components/layout/PageLayout';
import TradeTreeView from './TradeTreeView';
import { GitBranch } from 'lucide-react';

export const metadata = { title: 'Trade Tree | League Pulse' };

export default function TradeTreePage() {
  return (
    <PageLayout
      title="Trade Tree"
      subtitle="Every trade in league history, tracked by what happened next: points delivered, picks that became players, and where each asset ended up."
      icon={<GitBranch className="h-6 w-6 text-primary" />}
    >
      <TradeTreeView />
    </PageLayout>
  );
}
