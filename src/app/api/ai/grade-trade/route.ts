import { NextResponse } from 'next/server';
import { AINotConfiguredError, isAIConfigured } from '@/lib/ai/claude';
import { DEFAULT_PERSONALITIES, personalityById } from '@/lib/ai/personalities';
import { gradeTrade, type TradeForGrading } from '@/lib/ai/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isAIConfigured()) {
    return NextResponse.json(
      { error: 'AI is not configured', setup: 'Add ANTHROPIC_API_KEY to .env.local and restart.' },
      { status: 503 },
    );
  }

  try {
    const { personalityId, trade } = await request.json() as {
      personalityId?: string; trade: TradeForGrading;
    };
    if (!trade?.sides?.length) {
      return NextResponse.json({ error: 'trade.sides is required' }, { status: 400 });
    }

    const persona = personalityById(personalityId ?? 'analyst', DEFAULT_PERSONALITIES);
    const grade = await gradeTrade(persona, trade);

    return NextResponse.json({
      personality: { id: persona.id, name: persona.name, handle: persona.handle, accent: persona.accent },
      grade,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error('[api/ai/grade-trade]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Grading failed' },
      { status: 500 },
    );
  }
}
