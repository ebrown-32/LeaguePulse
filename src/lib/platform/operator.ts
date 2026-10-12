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

export function isOperatorRequest(req: Request): boolean {
  const secret = process.env.LP_OPERATOR_SECRET?.trim();
  if (!secret || secret.length < 24) return false;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
