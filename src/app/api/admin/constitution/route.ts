/**
 * The league's constitution, for its admin (lib/constitution).
 *
 *   GET   the document as it stands (what was saved, the repository's file on
 *         a self-hosted copy, or nothing yet) and its past versions
 *   PUT   { markdown, version, description, lastUpdated?, note? } publishes it;
 *         the version it replaces is kept in the history
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { constitutionHistory, getConstitution, saveConstitution } from '@/lib/constitution';

export const dynamic = 'force-dynamic';

const LIMITS = { markdown: 60_000, version: 20, description: 200, note: 200 };

export async function GET(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [{ doc, source }, history] = await Promise.all([getConstitution(), constitutionHistory()]);
  return NextResponse.json({ doc, source, history });
}

export async function PUT(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const markdown = typeof body?.markdown === 'string' ? body.markdown.replace(/\r\n/g, '\n') : '';
  if (!markdown.trim()) return NextResponse.json({ error: 'The constitution is empty. Add an article first.' }, { status: 400 });
  if (markdown.length > LIMITS.markdown) return NextResponse.json({ error: 'The constitution is too long to save. Trim it a little.' }, { status: 400 });
  const lastUpdated = text(body?.lastUpdated, 10);
  const saved = await saveConstitution({
    markdown,
    version: text(body?.version, LIMITS.version) || '1.0',
    description: text(body?.description, LIMITS.description) || null,
    lastUpdated: /^\d{4}-\d{2}-\d{2}$/.test(lastUpdated) ? lastUpdated : new Date().toISOString().slice(0, 10),
  }, text(body?.note, LIMITS.note) || null);
  return NextResponse.json({ doc: saved, source: 'saved', history: await constitutionHistory() });
}
