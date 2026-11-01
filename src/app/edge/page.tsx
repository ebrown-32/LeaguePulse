import { PageLayout } from '@/components/layout/PageLayout';
import EdgeView from './EdgeView';

export const metadata = { title: 'The Edge | League Pulse' };

export default function EdgePage() {
  return (
    <PageLayout title="The Edge" subtitle="What leagues like yours are doing, and what it means for yours." className="max-w-5xl">
      <EdgeView />
    </PageLayout>
  );
}
