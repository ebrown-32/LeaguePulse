/**
 * The persona studio (lib/ai/personaStudio), for the league's admin.
 *
 *   POST { type, spice, idea? } drafts a new personality;
 *        { type, spice, current, instruction? } revises one (no instruction:
 *        another take on the same idea).
 *
 * Returns the draft and sample posts. Nothing is saved here: the admin adds
 * the draft to the cast and saves it from the AI Desk, as with any edit.
 */

import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/tenant/admin';
import { AINotConfiguredError, isAIConfigured } from '@/lib/ai/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAIConfigured())) {
    return NextResponse.json({ error: 'The assistant needs AI set up first: add an Anthropic key above.' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const type = body.type === 'fan' ? 'fan' : 'media';
  const spice = body.spice === 'clean' || body.spice === 'savage' ? body.spice : 'cheeky';
  const c = body.current as Record<string, unknown> | undefined;
  const current = c && typeof c.voice === 'string'
    ? { name: text(c.name, 60) ?? '', handle: text(c.handle, 30) ?? '', tagline: text(c.tagline, 140) ?? '', voice: text(c.voice, 2000) ?? '', kinds: Array.isArray(c.kinds) ? c.kinds.filter(k => typeof k === 'string').slice(0, 12) : undefined }
    : undefined;

  try {
    const [{ designPersona }, { getPersonalities }] = await Promise.all([import('@/lib/ai/personaStudio'), import('@/lib/ai/store')]);
    // The rest of the cast (not the one being revised), so the new voice stands apart.
    const cast = (await getPersonalities()).filter(p => !p.hidden && p.name !== current?.name)
      .map(p => ({ name: p.name, handle: p.handle, tagline: p.tagline }));
    const draft = await designPersona({
      type, spice, idea: text(body.idea, 800), current: current as never, instruction: text(body.instruction, 600), cast,
    });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof AINotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error('[api/ai/persona-studio]', err);
    return NextResponse.json({ error: 'The assistant could not finish that one. Try again.' }, { status: 500 });
  }
}
