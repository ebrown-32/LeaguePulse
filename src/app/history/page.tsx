import fs from 'fs';
import path from 'path';
import { Database } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import EnhancedHistoryView from './EnhancedHistoryView';

export const dynamic = 'force-dynamic';

function getRingSeasons(): string[] {
  try {
    const dir = path.join(process.cwd(), 'public', 'models', 'rings');
    return fs.readdirSync(dir)
      .map(f => f.match(/^ring-(\d{4})\.glb$/)?.[1])
      .filter((s): s is string => !!s)
      .sort();
  } catch {
    return [];
  }
}

export default function HistoryPage() {
  const ringSeasons = getRingSeasons();
  return (
    <PageLayout
      title="League History"
      subtitle="Stats, records, and insights."
      icon={<Database className="h-6 w-6 text-primary" />}
    >
      <EnhancedHistoryView ringSeasons={ringSeasons} />
    </PageLayout>
  );
} 