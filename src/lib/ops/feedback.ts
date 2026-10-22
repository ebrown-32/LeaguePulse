/**
 * Bugs and ideas from the people using LeaguePulse, for the back office's inbox (/operator).
 *
 * Sent from any league's site (FeedbackButton), with what's needed to follow up: the page they
 * were on, their league, their browser and screen, the build they were running. Kept platform-wide
 * (lp_feedback), each item on its own key so the inbox can triage one without rewriting the rest,
 * and listed newest first.
 *
 * Server only.
 */

export type FeedbackKind = 'bug' | 'idea';
export type FeedbackStatus = 'new' | 'planned' | 'done' | 'wontfix';
export const STATUSES: FeedbackStatus[] = ['new', 'planned', 'done', 'wontfix'];

export interface Feedback {
  id: string;
  at: string;
  kind: FeedbackKind;
  title: string;
  details: string;
  /** To reply to, when they gave one (or were signed in). */
  email: string | null;
  /** The league's site it came from, or the product site. */
  league: string | null;
  page: string | null;
  userAgent: string | null;
  viewport: string | null;
  build: string | null;
  status: FeedbackStatus;
  /** The operator's own note. */
  note: string | null;
}

const LIST = 'lp_feedback_ids';
const item = (id: string) => `lp_feedback_item:${id}`;
const KEEP = 1000;

export const LIMITS = { title: 120, details: 4000, email: 200, note: 1000 } as const;

/** A submission, checked and trimmed; or what's wrong with it. */
export function checkFeedback(input: unknown): Pick<Feedback, 'kind' | 'title' | 'details' | 'email' | 'page' | 'viewport'> | string {
  const o = (input ?? {}) as Record<string, unknown>;
  const kind = o.kind === 'idea' ? 'idea' : o.kind === 'bug' ? 'bug' : null;
  if (!kind) return 'Pick a bug or an idea.';
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
  const title = text(o.title, LIMITS.title).replace(/\s+/g, ' ');
  const details = text(o.details, LIMITS.details);
  if (title.length < 3) return 'Give it a short title.';
  const email = text(o.email, LIMITS.email) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email doesn’t look right.';
  return { kind, title, details, email, page: text(o.page, 300) || null, viewport: text(o.viewport, 40) || null };
}

export async function addFeedback(f: Omit<Feedback, 'id' | 'at' | 'status' | 'note'>): Promise<Feedback | null> {
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  if (!r) return null;
  const at = new Date().toISOString();
  const full: Feedback = { ...f, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at, status: 'new', note: null };
  await r.set(item(full.id), JSON.stringify(full));
  await r.lpush(LIST, full.id);
  await r.ltrim(LIST, 0, KEEP - 1);
  return full;
}

export async function listFeedback(): Promise<Feedback[]> {
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  if (!r) return [];
  const ids = await r.lrange(LIST, 0, KEEP - 1).catch(() => [] as string[]);
  if (!ids.length) return [];
  const out: Feedback[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const raw = await r.mget(ids.slice(i, i + 200).map(item)).catch(() => []);
    for (const s of raw) { try { if (s) out.push(JSON.parse(s)); } catch { /* skip a bad one */ } }
  }
  return out;
}

export async function updateFeedback(id: string, change: { status?: unknown; note?: unknown }): Promise<Feedback | null> {
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  const raw = r ? await r.get(item(id)).catch(() => null) : null;
  if (!r || !raw) return null;
  const f = JSON.parse(raw) as Feedback;
  if (typeof change.status === 'string' && (STATUSES as string[]).includes(change.status)) f.status = change.status as FeedbackStatus;
  if (change.note !== undefined) f.note = typeof change.note === 'string' && change.note.trim() ? change.note.trim().slice(0, LIMITS.note) : null;
  await r.set(item(id), JSON.stringify(f));
  return f;
}

export async function deleteFeedback(id: string): Promise<void> {
  const { getRedis } = await import('@/lib/redisClient');
  const r = getRedis().client;
  if (!r) return;
  await r.del(item(id));
  await r.lrem(LIST, 0, id);
}
