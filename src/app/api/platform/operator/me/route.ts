/**
 * Whether the signed-in account is the operator. Sign-up asks, to offer the
 * operator a free league instead of a checkout. Says nothing else, and
 * nothing at all to anyone who is not signed in as the operator.
 */

import { NextResponse } from 'next/server';
import { isOperatorAccount } from '@/lib/platform/operator';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ operator: await isOperatorAccount() }, { headers: { 'cache-control': 'no-store' } });
}
