import { NextRequest, NextResponse } from 'next/server';
import { IntelligentContentGenerator } from '@/lib/contentGenerator';
import { defaultAgents } from '@/config/aiAgents';

// This endpoint will be called by Vercel Cron or an external scheduler
export async function POST(request: NextRequest) {
  try {
    // Verify the request is from a trusted source
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET || 'development-token';
    
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For cron jobs, we'll use environment variables
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // If no body, use defaults from environment
    }
    
    const { leagueId, enabledAgentIds } = body;
    const targetLeagueId = leagueId || process.env.NEXT_PUBLIC_LEAGUE_ID;

    if (!targetLeagueId) {
      return NextResponse.json({ 
        error: 'Missing leagueId. Set NEXT_PUBLIC_LEAGUE_ID environment variable.' 
      }, { status: 400 });
    }

    // Verify we have at least one LLM API key
    const hasLLMKey = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY);
    if (!hasLLMKey) {
      return NextResponse.json({ 
        error: 'No LLM API keys configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY.' 
      }, { status: 400 });
    }

    // Get enabled agents
    const enabledAgents = defaultAgents.filter(agent => 
      enabledAgentIds ? enabledAgentIds.includes(agent.id) : agent.enabled
    );

    if (enabledAgents.length === 0) {
      return NextResponse.json({ 
        error: 'No enabled agents found' 
      }, { status: 400 });
    }

    const generator = new IntelligentContentGenerator(targetLeagueId);
    const posts = [];
    const errors = [];

    // Generate 2-4 posts based on time of day and frequency settings
    const currentHour = new Date().getHours();
    const isNightTime = currentHour < 6 || currentHour > 22;
    const numPosts = isNightTime ? 1 : Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numPosts; i++) {
      // Select agent based on their posting frequency
      const agent = selectAgentByFrequency(enabledAgents);
      const contentTypes = agent.contentTypes.length > 0 ? agent.contentTypes : ['general', 'hot-take', 'analysis'];
      const randomType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

      try {
        const post = await generator.generateContextualContent(agent, randomType);
        if (post) {
          posts.push({
            id: post.id,
            agentId: post.agentId,
            type: post.type,
            timestamp: post.timestamp,
            preview: post.content.slice(0, 100) + '...'
          });
        }
      } catch (error) {
        console.error(`Failed to generate content for ${agent.name}:`, error);
        errors.push({
          agent: agent.name,
          type: randomType,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Small delay between posts to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Return success even if some posts failed
    return NextResponse.json({
      success: true,
      postsGenerated: posts.length,
      posts,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
      leagueId: targetLeagueId
    });

  } catch (error) {
    console.error('Error in auto-generate:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check recent generation stats and system health
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    
    // Check system health
    const systemHealth = {
      hasLLMKey: !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY),
      hasLeagueId: !!process.env.NEXT_PUBLIC_LEAGUE_ID,
      hasCronSecret: !!process.env.CRON_SECRET,
      enabledAgents: defaultAgents.filter(agent => agent.enabled).length
    };

    // Try to get recent posts (this will test storage)
    let recentPosts: any[] = [];
    let storageError = null;
    
    try {
      const { storage } = await import('@/lib/storage');
      const allPosts = await storage.getPosts(50, 0);
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      recentPosts = allPosts.filter(post => post.timestamp > cutoffTime);
    } catch (error) {
      storageError = error instanceof Error ? error.message : 'Storage error';
    }
    
    // Group by agent
    const postsByAgent = defaultAgents.map(agent => ({
      agentId: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      postsGenerated: recentPosts.filter(post => post.agentId === agent.id).length,
      lastPost: recentPosts
        .filter(post => post.agentId === agent.id)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]?.timestamp || null
    }));

    return NextResponse.json({
      timeframe: `${hours} hours`,
      totalPosts: recentPosts.length,
      postsByAgent,
      lastGeneration: recentPosts[0]?.timestamp || null,
      systemHealth,
      storageError,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting generation stats:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function selectAgentByFrequency(agents: any[]): any {
  // Weight agents by their posting frequency
  const weighted = [];
  
  for (const agent of agents) {
    const weight = agent.postFrequency === 'high' ? 3 : 
                   agent.postFrequency === 'medium' ? 2 : 1;
    
    for (let i = 0; i < weight; i++) {
      weighted.push(agent);
    }
  }
  
  return weighted[Math.floor(Math.random() * weighted.length)];
}