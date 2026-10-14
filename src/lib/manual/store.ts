/**
 * Where a league's entered data lives: one record per league, in Redis under
 * the league's own prefix. Server only.
 *
 * Read on every league request that it can change, so it is held in memory
 * for a few seconds per league; a save clears that, so the admin sees an
 * entry straight away.
 */

import { getRedis } from '@/lib/redisClient';
import { EMPTY, type ManualData } from './model';

const KEY = 'manual_data_v1';
const MEMO_MS = 5000;
const memo = new Map<string, { at: number; data: ManualData }>();

async function scope(): Promise<string> {
  if (process.env.LP_HOSTED !== '1') return 'self';
  const { currentTenant } = await import('@/lib/tenant/context');
  return (await currentTenant())?.slug ?? 'none';
}

export async function getManual(): Promise<ManualData> {
  const s = await scope();
  const hit = memo.get(s);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.data;
  const raw = await getRedis().client?.get(KEY).catch(() => null);
  let data: ManualData = EMPTY;
  try { if (raw) data = { ...EMPTY, ...JSON.parse(raw) }; } catch { /* keep empty */ }
  memo.set(s, { at: Date.now(), data });
  return data;
}

export async function saveManual(data: ManualData): Promise<void> {
  const r = getRedis().client;
  if (!r) throw new Error('Storage is not configured');
  await r.set(KEY, JSON.stringify(data));
  memo.delete(await scope());
}

// leagueFetch reads entries through globalThis on the server (see leagueFetch.ts).
globalThis.__lpManual = getManual;
