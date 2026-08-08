import { NextResponse } from 'next/server';
import { isAIConfigured, MODEL_FAST, MODEL_SMART } from '@/lib/ai/claude';
import { DEFAULT_PERSONALITIES } from '@/lib/ai/personalities';
import { buildLeagueBrief } from '@/lib/ai/leagueBrief';
import { storageHealth, getQueuedCount } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lets the UI show a real setup state instead of failing on first click.
 *  `?brief=1` returns the exact factual context the personalities are given —
 *  useful for auditing that nothing is being invented. */
export async function GET(request: Request) {
  const wantBrief = new URL(request.url).searchParams.get('brief') === '1';
  let brief: string | undefined;
  if (wantBrief) {
    try { brief = (await buildLeagueBrief()).text; }
    catch (e) { brief = `failed to build brief: ${e instanceof Error ? e.message : e}`; }
  }

  return NextResponse.json({
    brief,
    storage: await storageHealth(),
    queued: await getQueuedCount(),
    configured: isAIConfigured(),
    provider: 'anthropic',
    models: { fast: MODEL_FAST, smart: MODEL_SMART },
    personalities: DEFAULT_PERSONALITIES.map(p => ({
      id: p.id, name: p.name, handle: p.handle, tagline: p.tagline,
      accent: p.accent, kinds: p.kinds, enabled: p.enabled,
    })),
  });
}
