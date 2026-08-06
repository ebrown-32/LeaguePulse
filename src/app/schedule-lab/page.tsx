import { PageLayout } from '@/components/layout/PageLayout';
import ScheduleLabView from './ScheduleLabView';
import { Shuffle } from 'lucide-react';

export const metadata = { title: 'Schedule Lab | League Pulse' };

export default function ScheduleLabPage() {
  return (
    <PageLayout
      title="Schedule Lab"
      subtitle="How brutal was your schedule, really? Borrow anyone else's slate and watch your season rewrite itself."
    >
      <ScheduleLabView />
    </PageLayout>
  );
}
