import { PageLayout } from '@/components/layout/PageLayout';
import EdgeView from './EdgeView';

export const metadata = { title: 'The Edge | League Pulse' };

export default function EdgePage() {
  // The Edge reads thousands of other leagues, sampled by the hosted product's crawl (lib/market/crawl).
  // A self-hosted copy has none to compare against, so it says so rather than "check back" forever.
  const hosted = process.env.LP_HOSTED === '1';
  return (
    <PageLayout title="The Edge" subtitle="What leagues like yours are doing, and what it means for yours." className="max-w-5xl">
      {hosted ? <EdgeView /> : (
        <div className="lp-surface rounded-xl p-6 text-[14px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">The Edge isn&apos;t available on this site.</p>
          <p className="mt-1">It compares your league with thousands of others that LeaguePulse samples every week, which only the hosted version of LeaguePulse does.</p>
        </div>
      )}
    </PageLayout>
  );
}
