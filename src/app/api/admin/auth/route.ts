import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/tenant/admin';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    if (await checkAdmin(request, password)) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}