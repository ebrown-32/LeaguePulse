/** The platform operator's panel. See components/platform/OperatorPanel. */

import OperatorPanel from '@/components/platform/OperatorPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Operator | LeaguePulse', robots: { index: false, follow: false } };

export default function OperatorPage() {
  return <OperatorPanel />;
}
