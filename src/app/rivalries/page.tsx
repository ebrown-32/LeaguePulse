import { Sword } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import RivalryView from './RivalryView';
import type { RivalriesResponse } from '@/app/api/rivalries/route';

export const dynamic = 'force-dynamic';

export default async function RivalriesPage() {
  let data: RivalriesResponse | null = null;
  let errorMsg: string | null = null;

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res  = await fetch(`${base}/api/rivalries`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    data = await res.json();
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : 'Failed to load rivalry data';
  }

  if (errorMsg || !data) {
    return (
      <ErrorMessage
        title="Failed to Load Rivalries"
        message={errorMsg ?? 'Unknown error'}
      />
    );
  }

  return (
    <PageLayout
      title="Rivalry Tracker"
      subtitle="All-time head-to-head records across every season."
      icon={<Sword className="h-6 w-6 text-primary" />}
    >
      <RivalryView data={data} />
    </PageLayout>
  );
}
