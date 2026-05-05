import { NextRequest, NextResponse } from 'next/server';
import { getTheme, saveTheme, resetTheme } from '@/lib/themeStorage';
// Note: themeStorage is server-only (Node.js Redis / fs). This file is an API route so it's fine.

function isAuthorized(req: NextRequest): boolean {
  const password = req.headers.get('x-admin-password');
  const expected = process.env.ADMIN_PASSWORD || 'admin123';
  return password === expected;
}

export async function GET() {
  try {
    const theme = await getTheme();
    return NextResponse.json(theme);
  } catch (err) {
    console.error('GET /api/admin/theme error:', err);
    return NextResponse.json({ error: 'Failed to load theme' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updated = await saveTheme(body);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PUT /api/admin/theme error:', err);
    return NextResponse.json({ error: 'Failed to save theme' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const reset = await resetTheme();
    return NextResponse.json(reset);
  } catch (err) {
    console.error('DELETE /api/admin/theme error:', err);
    return NextResponse.json({ error: 'Failed to reset theme' }, { status: 500 });
  }
}
