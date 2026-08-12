import { Metadata } from 'next';
import AdminShell from './AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin | LeaguePulse',
  description: 'Configure appearance and the AI desk.',
};

export default function AdminPage() {
  return <AdminShell />;
}
