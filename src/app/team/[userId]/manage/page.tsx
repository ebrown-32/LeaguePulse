import ManageView from './ManageView';

export const metadata = { title: 'Manage franchise | League Pulse', robots: { index: false } };

export default async function ManageFranchisePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <ManageView franchiseId={decodeURIComponent(userId)} />;
}
