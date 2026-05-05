import { PageLayout } from '@/components/layout/PageLayout';
import TradeSwiper from './TradeSwiper';
import { ArrowLeftRight } from 'lucide-react';

export const metadata = { title: 'Trade Ideas — League Pulse' };

export default function TradesPage() {
  return (
    <PageLayout
      title="Trade Ideas"
      subtitle="Swipe on AI-suggested trades based on your league's actual rosters and scoring"
      icon={<ArrowLeftRight className="h-6 w-6 text-primary" />}
    >
      <TradeSwiper />
    </PageLayout>
  );
}
