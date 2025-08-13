import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/lib/hybridStorage';
import { defaultAgents, type AIAgent } from '@/config/aiAgents';

export async function GET() {
  try {
    const hasPersistedAgents = await storage.hasPersistedAgents();
    
    if (hasPersistedAgents) {
      const agents = await storage.getAgents();
      return NextResponse.json({ agents });
    }
    
    // If no persisted agents, return defaults and save them
    await storage.saveAgents(defaultAgents);
    return NextResponse.json({ agents: defaultAgents });
  } catch (error) {
    console.error('Failed to load agent configurations:', error);
    return NextResponse.json(
      { error: 'Failed to load agent configurations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { agents }: { agents: AIAgent[] } = await request.json();
    
    if (!Array.isArray(agents)) {
      return NextResponse.json(
        { error: 'Invalid agents data' },
        { status: 400 }
      );
    }
    
    await storage.saveAgents(agents);
    
    return NextResponse.json({ 
      success: true,
      message: 'Agent configurations saved successfully'
    });
  } catch (error) {
    console.error('Failed to save agent configurations:', error);
    return NextResponse.json(
      { error: 'Failed to save agent configurations' },
      { status: 500 }
    );
  }
}