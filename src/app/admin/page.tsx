import { Metadata } from 'next';
import AdminShell from './AdminShell';
import { leagueDisplayName } from '@/lib/leagueName';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin | LeaguePulse',
  description: 'Configure appearance and the AI desk.',
};

export default async function AdminPage() {
  return <AdminShell leagueName={await leagueDisplayName()} />;
}
