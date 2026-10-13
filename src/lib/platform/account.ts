/**
 * Accounts on the hosted product, through Clerk.
 *
 * Only the product site (the bare domain) signs people in. League sites never
 * load Clerk: a league admin page is opened from the account page with a
 * short-lived pass (adminPass.ts), so subdomains need no shared session and
 * self-hosted copies need no Clerk at all.
 */

export function accountsEnabled(): boolean {
  return process.env.LP_HOSTED === '1'
    && Boolean(process.env.CLERK_SECRET_KEY?.trim())
    && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}

export interface Account { userId: string; email: string | null; name: string | null }

/** The signed-in user, or null. Their email only counts once Clerk has verified it. */
export async function signedInAccount(): Promise<Account | null> {
  if (!accountsEnabled()) return null;
  const { currentUser } = await import('@clerk/nextjs/server');
  const u = await currentUser().catch(() => null);
  if (!u) return null;
  const primary = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId);
  const verified = primary?.verification?.status === 'verified' ? primary.emailAddress : null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;
  return { userId: u.id, email: verified, name };
}
