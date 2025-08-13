import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'; // Default for development
    
    if (password === adminPassword) {
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