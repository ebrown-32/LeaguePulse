/**
 * The platform operator: you, running the hosted product.
 *
 * Operator requests carry `Authorization: Bearer <LP_OPERATOR_SECRET>`. A
 * separate secret from CRON_SECRET on purpose: the cron secret sits in GitHub
 * Actions and is used every hour, and it should not also be able to hand out
 * admin access to any league. With no operator secret set, operator routes are
 * closed.
 */

import { timingSafeEqual } from 'node:crypto';

/** Whether the request carries `Authorization: Bearer <secret>`, compared in constant time. */
export function bearerMatches(req: Request, secret: string | undefined | null): boolean {
  if (!secret) return false;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isOperatorRequest(req: Request): boolean {
  const secret = process.env.LP_OPERATOR_SECRET?.trim();
  if (!secret || secret.length < 24) return false;
  return bearerMatches(req, secret);
}

/**
 * The operator's own accounts: verified emails in LP_OPERATOR_EMAILS (comma
 * separated) are operators when signed in on the product site, so the back
 * office opens without pasting the secret. The secret still works, for
 * scripts and as a way in if accounts are ever down.
 */
export function operatorEmails(): string[] {
  return (process.env.LP_OPERATOR_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export async function isOperatorAccount(): Promise<boolean> {
  const emails = operatorEmails();
  if (!emails.length) return false;
  const { signedInAccount } = await import('./account');
  const me = await signedInAccount();
  return Boolean(me?.email && emails.includes(me.email.toLowerCase()));
}

/** Secret or signed-in operator account. */
export async function isOperator(req: Request): Promise<boolean> {
  return isOperatorRequest(req) || isOperatorAccount();
}
