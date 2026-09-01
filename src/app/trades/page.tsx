import { PageLayout } from '@/components/layout/PageLayout';
import TradeSwiper from './TradeSwiper';

export const metadata = { title: 'Trade Ideas | League Pulse' };

export default function TradesPage() {
  return (
    <PageLayout
      title="Trade Ideas"
      subtitle="Swipe on AI-suggested trades based on your league's actual rosters and scoring"
    >
      <TradeSwiper />
    </PageLayout>
  );
}
