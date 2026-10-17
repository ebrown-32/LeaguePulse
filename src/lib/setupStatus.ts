/**
 * How far this league's site is through its setup (lib/setup): each step read
 * from what is saved. Server only; runs inside the league's own request.
 */

import type { SetupStatus, SetupStepId } from './setup';

const KEY = 'lp_setup';
interface SetupRecord { dismissedAt?: string; sharedAt?: string; marked?: SetupStepId[] }

async function record(): Promise<SetupRecord> {
  const { readJson } = await import('./jsonStore');
  return readJson<SetupRecord>(KEY, 'setup.json', {});
}

export type SetupChange =
  | { action: 'dismissed' | 'shared' | 'reopened' }
  /** An admin ticking a step off by hand, or taking that back. */
  | { action: 'mark'; step: SetupStepId; done: boolean };

/** Hide the guide (for every admin, on every page, for good), mark the link shared, or tick a step off by hand. */
export async function markSetup(change: SetupChange): Promise<void> {
  const { writeJson } = await import('./jsonStore');
  const r = await record();
  const now = new Date().toISOString();
  if (change.action === 'dismissed') r.dismissedAt = now;
  if (change.action === 'shared') r.sharedAt = now;
  if (change.action === 'reopened') delete r.dismissedAt;
  if (change.action === 'mark') {
    const rest = (r.marked ?? []).filter(id => id !== change.step);
    r.marked = change.done ? [...rest, change.step] : rest;
  }
  await writeJson(KEY, 'setup.json', r);
}

export const STEP_IDS: readonly SetupStepId[] = ['appearance', 'ai', 'managers', 'constitution', 'share'];

const safe = (p: Promise<boolean>) => p.catch(() => false);

export async function setupStatus(): Promise<SetupStatus> {
  const hosted = process.env.LP_HOSTED === '1';
  const [r, appearance, ai, managers, constitution] = await Promise.all([
    record().catch(() => ({}) as SetupRecord),
    safe(import('./themeStorage').then(m => m.themeSaved())),
    // A key of the league's own, or (League Pass + AI) the platform's.
    safe(import('./ai/claude').then(async m => Boolean(await m.anthropicKey()))),
    // Hosted only: self-hosted franchises are read-only, with no one to invite.
    hosted ? safe((async () => {
      const [{ currentSite }, store] = await Promise.all([import('./archive/ingest'), import('./franchise/store')]);
      const site = await currentSite();
      const [invites, claims, records] = await Promise.all([store.getInvites(site), store.getClaims(site), store.listFranchiseRecords(site)]);
      return invites.length > 0 || claims.length > 0 || records.some(f => f.manager);
    })()) : Promise.resolve(false),
    safe(import('./constitution').then(async m => (await m.getConstitution()).source !== 'none')),
  ]);
  const done: Record<SetupStepId, boolean> = { appearance, ai, managers, constitution, share: Boolean(r.sharedAt) };
  const ids: SetupStepId[] = hosted ? ['appearance', 'ai', 'managers', 'constitution', 'share'] : ['appearance', 'ai', 'constitution', 'share'];
  const marked = new Set(r.marked ?? []);
  return {
    steps: ids.map(id => ({ id, done: done[id] || marked.has(id), marked: !done[id] && marked.has(id) })),
    dismissed: Boolean(r.dismissedAt),
  };
}
