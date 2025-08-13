import { NextRequest, NextResponse } from 'next/server';

// Enhanced news fetching with multiple sources
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Try to fetch from ESPN API (existing endpoint)
    let newsItems = [];
    
    try {
      const espnResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/news`);
      if (espnResponse.ok) {
        const espnData = await espnResponse.json();
        newsItems = espnData.slice(0, limit);
      }
    } catch (error) {
      console.warn('ESPN API unavailable, using mock data');
    }
    
    // If ESPN API fails or returns no data, use enhanced mock data
    if (newsItems.length === 0) {
      newsItems = [
        {
          headline: "Star Running Back Questionable for Sunday's Game",
          description: "Fantasy football managers should monitor practice reports as their RB1 deals with a minor ankle injury that could impact his availability and workload.",
          published: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
          category: "Injury Report",
          impact: "High",
          players: ["RB1", "Backup RB"]
        },
        {
          headline: "Rookie Wide Receiver Emerges as Red Zone Target",
          description: "The second-round pick has seen his red zone targets increase significantly over the past three weeks, making him a potential league winner.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          category: "Breakout Alert",
          impact: "Medium",
          players: ["Rookie WR"]
        },
        {
          headline: "Veteran Quarterback's Struggles Continue",
          description: "Fantasy managers may need to consider streaming options as the veteran signal-caller faces another tough defensive matchup.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
          category: "Performance",
          impact: "Medium",
          players: ["Veteran QB"]
        },
        {
          headline: "Defense/Special Teams Unit Posts Historic Performance",
          description: "The unit recorded three interceptions, two fumble recoveries, and a defensive touchdown, making them a must-start for fantasy playoffs.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
          category: "Performance",
          impact: "Low",
          players: ["Team DST"]
        },
        {
          headline: "Trade Deadline Acquisition Makes Immediate Impact",
          description: "The newly acquired pass-catcher found instant chemistry with his quarterback, posting 8 catches for 127 yards in his debut.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), // 8 hours ago
          category: "Trade Impact",
          impact: "High",
          players: ["New WR"]
        },
        {
          headline: "Kicker Maintains Perfect Record in Crucial Games",
          description: "The reliable leg has converted all 15 field goal attempts in games decided by one score, making him a valuable fantasy asset.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(), // 10 hours ago
          category: "Kicker News",
          impact: "Low",
          players: ["Team K"]
        },
        {
          headline: "Tight End Position Sees Unexpected Surge",
          description: "Multiple TEs have posted TE1 performances this week, creating difficult lineup decisions for fantasy managers.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
          category: "Position Analysis",
          impact: "Medium",
          players: ["Multiple TEs"]
        },
        {
          headline: "Weather Concerns for Sunday's Outdoor Games",
          description: "High winds and potential precipitation could significantly impact passing games in three key fantasy matchups.",
          published: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(), // 14 hours ago
          category: "Weather",
          impact: "Medium",
          players: ["Multiple QBs/WRs"]
        }
      ].slice(0, limit);
    }

    return NextResponse.json({ 
      news: newsItems,
      timestamp: new Date().toISOString(),
      source: newsItems.length > 0 && newsItems[0].link ? 'ESPN' : 'Mock Data'
    });
  } catch (error) {
    console.error('Error fetching AI agents news:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news data' },
      { status: 500 }
    );
  }
}