import AdminConfigView from './AdminConfigView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin: AI Configuration | LeaguePulse',
  description: 'Administrative interface for configuring AI agents, personalities, and automation.',
};

export default function AdminAIConfigPage() {
  return <AdminConfigView />;
}