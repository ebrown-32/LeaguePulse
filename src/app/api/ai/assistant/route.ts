import { NextResponse } from 'next/server';
import { getAssistant, saveAssistant } from '@/lib/ai/store';
import { isAdminRequest } from '@/lib/tenant/admin';

export const dynamic = 'force-dynamic';

/** Public read: the widget needs the name to render its header. */
export async function GET() {
  try {
    return NextResponse.json(await getAssistant());
  } catch {
    return NextResponse.json({ name: 'Captain Mike' });
  }
}

/** Admin write. */
export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    if (typeof body?.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    }
    await saveAssistant({ name: body.name });
    return NextResponse.json(await getAssistant());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save' },
      { status: 500 },
    );
  }
}
