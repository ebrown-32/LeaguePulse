import { personaAvatarUrl } from '@/lib/ai/avatar';
import { NextRequest, NextResponse } from 'next/server';
import { AINotConfiguredError, isAIConfigured } from '@/lib/ai/claude';
import { personalityById, type ContentKind } from '@/lib/ai/personalities';
import { writeArticle, writeTweet, writeComment, writePowerRankings, writePredictions, angleAt } from '@/lib/ai/generate';
import { addPost, getPersonalities, type FeedPost } from '@/lib/ai/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-password') === (process.env.ADMIN_PASSWORD || 'admin123');
}

/** Admin-only: visitors read the feed, they never generate into it. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured', setup: 'Add ANTHROPIC_API_KEY to .env.local and restart.' },
      { status: 503 },
    );
  }

  try {
    const { personalityId, kind, topic, subject } = await request.json() as {
      personalityId: string; kind: ContentKind; topic?: string; subject?: string;
    };

    const persona = personalityById(personalityId, await getPersonalities());
    if (!persona.kinds.includes(kind)) {
      return NextResponse.json(
        { error: `${persona.name} does not write ${kind}` },
        { status: 400 },
      );
    }

    const started = Date.now();
    let content: unknown;
    // Manual runs get a random lens so repeated clicks do not repeat themselves.
    const angle = angleAt(Math.floor(Math.random() * 1000));
    if (kind === 'article')             content = await writeArticle(persona, topic, angle);
    else if (kind === 'powerRankings')  content = await writePowerRankings(persona);
    else if (kind === 'predictions')    content = await writePredictions(persona);
    else if (kind === 'tweet')          content = await writeTweet(persona, topic, angle);
    else if (kind === 'comment')        content = await writeComment(persona, subject ?? topic ?? '');
    else return NextResponse.json({ error: 'Use /api/ai/grade-trade for trade grades' }, { status: 400 });

    const post: FeedPost = {
      id: `${Date.now()}-${persona.id}`,
      personalityId: persona.id,
      personaName: persona.name,
      personaHandle: persona.handle,
      personaAccent: persona.accent,
      personaType: persona.type ?? 'media',
      personaAvatar: personaAvatarUrl(persona),
      kind,
      content: content as any,
      createdAt: new Date().toISOString(),
      // Admin publishes are immediate; only the daily batch is staggered.
      publishAt: new Date().toISOString(),
      source: 'admin',
    };
    // Published straight to the same feed the scheduler writes to, so admin
    // output and auto-posts are indistinguishable to readers.
    if (kind !== 'comment') await addPost(post);

    return NextResponse.json({ post, ms: Date.now() - started });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[api/ai/generate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
