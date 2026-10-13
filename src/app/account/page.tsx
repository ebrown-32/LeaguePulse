/** A commissioner's account: their leagues. See components/platform/AccountView. */

import { redirect } from 'next/navigation';
import { accountsEnabled, signedInAccount } from '@/lib/platform/account';
import AccountView from '@/components/platform/AccountView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My leagues | LeaguePulse', robots: { index: false } };

export default async function AccountPage() {
  if (!accountsEnabled()) redirect('/');
  if (!(await signedInAccount())) redirect('/sign-in?redirect_url=%2Faccount');
  return <AccountView />;
}
