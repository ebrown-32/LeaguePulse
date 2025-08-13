import { NextRequest, NextResponse } from 'next/server';
import { IntelligentContentGenerator } from '@/lib/contentGenerator';
import { defaultAgents, type AIAgent, type AgentPost } from '@/config/aiAgents';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, type, leagueId } = body;

    // Validate inputs
    if (!agentId || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId and type' },
        { status: 400 }
      );
    }

    // Find the agent
    const agent = defaultAgents.find(a => a.id === agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Use the league ID from the request or environment
    const targetLeagueId = leagueId || process.env.NEXT_PUBLIC_LEAGUE_ID || 'demo_league';
    
    // Generate intelligent content
    const generator = new IntelligentContentGenerator(targetLeagueId);
    const post = await generator.generateContextualContent(agent, type);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Failed to generate content' },
        { status: 500 }
      );
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error in generate API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const type = searchParams.get('type') as AgentPost['type'];
    const leagueId = searchParams.get('leagueId');
    
    if (!agentId || !type) {
      return NextResponse.json(
        { error: 'Missing required query parameters: agentId and type' },
        { status: 400 }
      );
    }

    const agent = defaultAgents.find(a => a.id === agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const targetLeagueId = leagueId || process.env.NEXT_PUBLIC_LEAGUE_ID || 'demo_league';
    
    const generator = new IntelligentContentGenerator(targetLeagueId);
    const post = await generator.generateContextualContent(agent, type);
    
    if (!post) {
      return NextResponse.json(
        { error: 'Failed to generate content' },
        { status: 500 }
      );
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Error in generate API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}