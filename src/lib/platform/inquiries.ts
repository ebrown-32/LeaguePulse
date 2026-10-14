/**
 * Custom tier inquiries: people who want a site designed around their league.
 * A platform record (shared prefix), newest first, read by the back office.
 */

import { getRedis } from '@/lib/redisClient';

export const INQUIRIES = 'lp_tenant_inquiries';

export interface Inquiry { id: string; name: string; email: string; league: string; message: string; at: string }

export async function listInquiries(limit = 100): Promise<Inquiry[]> {
  const rows = await getRedis().client?.lrange(INQUIRIES, 0, limit - 1).catch(() => []) ?? [];
  return rows.flatMap(r => { try { return [JSON.parse(r) as Inquiry]; } catch { return []; } });
}

export async function removeInquiry(id: string): Promise<void> {
  const r = getRedis().client;
  if (!r) return;
  for (const row of await r.lrange(INQUIRIES, 0, -1)) {
    try { if ((JSON.parse(row) as Inquiry).id === id) await r.lrem(INQUIRIES, 1, row); } catch { /* skip */ }
  }
}
