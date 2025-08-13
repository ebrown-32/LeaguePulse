export interface AIAgent {
  id: string;
  name: string;
  username: string; // Twitter-like handle
  avatar: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  backgroundColor: string;
  accentColor: string;
  enabled: boolean;
  // LLM Configuration
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  model?: 'claude-3-haiku' | 'claude-3-sonnet' | 'gpt-3.5-turbo' | 'gpt-4' | 'llama3-8b';
  // Content preferences
  contentTypes: AgentPost['type'][];
  postFrequency: 'low' | 'medium' | 'high';
  // Tools and capabilities
  tools: AgentTool[];
  personality: {
    tone: 'professional' | 'casual' | 'aggressive' | 'humorous' | 'analytical' | 'encouraging';
    expertise: string[];
    catchphrases: string[];
    writingStyle: {
      useEmojis: boolean;
      useAllCaps: boolean;
      useHashtags: boolean;
      avgWordsPerPost: number;
    };
  };
  // Customizable traits
  customFields?: Record<string, any>;
}

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters?: Record<string, any>;
}

// Available tools that agents can use
export const availableTools: AgentTool[] = [
  // Core Sleeper API Tools
  {
    id: 'get-league-standings',
    name: 'League Standings',
    description: 'Get current league standings with wins, losses, points for/against',
    enabled: true,
    parameters: {
      includeRecords: true,
      includePointsFor: true,
      includePointsAgainst: true
    }
  },
  {
    id: 'get-current-matchups',
    name: 'Current Week Matchups',
    description: 'Get all matchups for the current week with live scores',
    enabled: true,
    parameters: {
      includeProjections: true,
      includeLiveScores: true
    }
  },
  {
    id: 'get-specific-matchup',
    name: 'Specific Matchup Analysis',
    description: 'Get detailed analysis of a specific head-to-head matchup',
    enabled: true,
    parameters: {
      includePlayerStats: true,
      includeHistory: true
    }
  },
  {
    id: 'get-close-games',
    name: 'Close Games Finder',
    description: 'Find close/exciting games from current or previous weeks',
    enabled: true,
    parameters: {
      pointDifferenceThreshold: 10,
      includeUpsets: true
    }
  },
  {
    id: 'get-team-rosters',
    name: 'Team Rosters',
    description: 'Access detailed roster information for all teams',
    enabled: true,
    parameters: {
      includePlayerDetails: true,
      includeInjuries: true,
      includeBench: true
    }
  },
  {
    id: 'get-player-stats',
    name: 'Player Performance Stats',
    description: 'Get detailed player statistics and performance data',
    enabled: true,
    parameters: {
      includeProjections: true,
      includeSeasonStats: true,
      includeRecentForm: true
    }
  },
  {
    id: 'get-waiver-trends',
    name: 'Waiver Wire Trends',
    description: 'Analyze trending players being added/dropped across leagues',
    enabled: true,
    parameters: {
      lookbackHours: 24,
      limit: 25,
      includeAddDropRatio: true
    }
  },
  {
    id: 'get-playoff-picture',
    name: 'Playoff Picture Analysis',
    description: 'Analyze current playoff standings and scenarios',
    enabled: true,
    parameters: {
      includeScenarios: true,
      includeTiebreakers: true,
      weeksRemaining: true
    }
  },
  {
    id: 'get-league-history',
    name: 'League History',
    description: 'Access historical league data and season comparisons',
    enabled: true,
    parameters: {
      includePreviousSeasons: true,
      includeChampionships: true,
      includeRecords: true
    }
  },
  {
    id: 'get-trade-activity',
    name: 'Trade Activity Monitor',
    description: 'Track recent trades and analyze their impact',
    enabled: true,
    parameters: {
      includeTradeValue: true,
      includeImpactAnalysis: true,
      daysBack: 30
    }
  },
  
  // Enhanced Analysis Tools
  {
    id: 'power-rankings-generator',
    name: 'Power Rankings Generator',
    description: 'Create comprehensive power rankings with multiple factors',
    enabled: true,
    parameters: {
      includeStrengthOfSchedule: true,
      includeRecentForm: true,
      includeProjections: true
    }
  },
  {
    id: 'matchup-predictor',
    name: 'Advanced Matchup Predictions',
    description: 'Predict matchup outcomes with confidence scores and reasoning',
    enabled: true,
    parameters: {
      includePlayerProjections: true,
      includeWeather: false,
      includeInjuries: true,
      confidenceThreshold: 0.6
    }
  },
  {
    id: 'sleeper-news-monitor',
    name: 'Sleeper News Feed',
    description: 'Monitor Sleeper news feed for league-relevant updates',
    enabled: true,
    parameters: {
      includeInjuries: true,
      includeTransactions: true,
      includeDepthCharts: true
    }
  },
  
  // Internet Search & External Data
  {
    id: 'web-search',
    name: 'Internet Search',
    description: 'Search the internet for NFL news, player updates, and fantasy analysis',
    enabled: true,
    parameters: {
      maxResults: 10,
      safeSearch: true,
      includeNews: true,
      includeAnalysis: true
    }
  },
  {
    id: 'nfl-news-search',
    name: 'NFL News Search',
    description: 'Search specifically for NFL news and breaking updates',
    enabled: true,
    parameters: {
      sources: ['espn', 'nfl.com', 'fantasy_pros'],
      includeInjuryReports: true,
      includeDepthCharts: true
    }
  },
  {
    id: 'fantasy-analysis-search',
    name: 'Fantasy Analysis Search',
    description: 'Search for expert fantasy football analysis and rankings',
    enabled: true,
    parameters: {
      expertSources: true,
      includeRankings: true,
      includeProjections: true,
      currentWeekOnly: false
    }
  }
];

export interface AgentPost {
  id: string;
  agentId: string;
  content: string;
  type: 'analysis' | 'prediction' | 'power-ranking' | 'matchup' | 'news' | 'hot-take' | 'general';
  timestamp: Date;
  likes: number;
  retweets: number;
  replies: number;
  featured?: boolean;
  images?: string[];
  hashtags?: string[];
  mentions?: string[];
}

// Customizable AI Agent Configuration
export const defaultAgents: AIAgent[] = [
  {
    id: 'the-analyst',
    name: 'Fantasy Analytics Pro',
    username: '@FantasyAnalyzer',
    avatar: '📊',
    bio: 'Data-driven fantasy football insights. Numbers don\'t lie. #Analytics #FantasyFootball',
    verified: true,
    followers: 12500,
    following: 247,
    backgroundColor: 'from-blue-500/20 to-indigo-600/20',
    accentColor: 'blue-500',
    enabled: true,
    systemPrompt: `You are a data-driven fantasy football analyst. Your personality traits:
- Analytical and methodical
- Always back up opinions with statistics and data
- Use numbers, percentages, and trends in your analysis
- Professional tone but accessible
- Focus on actionable insights
- Reference advanced metrics when relevant

When creating content:
- Include specific data points and statistics
- Mention trends over multiple weeks/seasons
- Use analytical language like "correlation", "regression", "variance"
- Provide confidence levels for predictions
- Compare current performance to historical averages

Keep posts concise but informative, using data to support every claim.`,
    temperature: 0.3,
    maxTokens: 280,
    model: 'claude-3-haiku',
    contentTypes: ['analysis', 'prediction', 'power-ranking'],
    postFrequency: 'medium',
    tools: [
      { ...availableTools.find(t => t.id === 'league-analysis')!, enabled: true },
      { ...availableTools.find(t => t.id === 'power-rankings')!, enabled: true },
      { ...availableTools.find(t => t.id === 'matchup-predictor')!, enabled: true },
      { ...availableTools.find(t => t.id === 'playoff-simulator')!, enabled: true }
    ],
    personality: {
      tone: 'analytical',
      expertise: ['statistics', 'data analysis', 'trends', 'projections'],
      catchphrases: ['The numbers don\'t lie', 'Based on the data', 'Statistical significance shows'],
      writingStyle: {
        useEmojis: false,
        useAllCaps: false,
        useHashtags: true,
        avgWordsPerPost: 45
      }
    }
  },
  {
    id: 'the-trash-talker',
    name: 'Commissioner Chaos',
    username: '@CommishChaos',
    avatar: '🔥',
    bio: 'Your league\'s worst nightmare. Hot takes & brutal honesty. No feelings spared. 🏈💀',
    verified: true,
    followers: 8900,
    following: 89,
    backgroundColor: 'from-red-500/20 to-orange-600/20',
    accentColor: 'red-500',
    enabled: true,
    systemPrompt: `You are a provocative fantasy football personality who loves stirring the pot. Your traits:
- Bold, controversial, and unapologetic
- Call out bad decisions and overrated players
- Use aggressive language and fire emojis
- Make predictions that go against popular opinion
- Roast team names, bad trades, and poor lineup decisions
- Love creating drama and controversy

Writing style:
- Use ALL CAPS for emphasis
- Include fire, skull, and explosion emojis
- Make bold declarations and hot takes
- Question everyone's decisions
- Use phrases like "EXPOSED", "FRAUD", "FADE THE HYPE"
- Be entertaining but not mean-spirited

Make every post spicy and attention-grabbing.`,
    temperature: 0.8,
    maxTokens: 280,
    model: 'claude-3-haiku',
    contentTypes: ['hot-take', 'general', 'matchup'],
    postFrequency: 'high',
    tools: [
      { ...availableTools.find(t => t.id === 'league-analysis')!, enabled: true },
      { ...availableTools.find(t => t.id === 'news-reactor')!, enabled: true },
      { ...availableTools.find(t => t.id === 'matchup-predictor')!, enabled: true }
    ],
    personality: {
      tone: 'aggressive',
      expertise: ['hot takes', 'controversy', 'bold predictions', 'trash talk'],
      catchphrases: ['EXPOSED!', 'Fade the hype', 'Y\'all ain\'t ready', 'This league SOFT'],
      writingStyle: {
        useEmojis: true,
        useAllCaps: true,
        useHashtags: true,
        avgWordsPerPost: 35
      }
    }
  },
  {
    id: 'the-hype-man',
    name: 'Energy Eddie',
    username: '@HypeTrainEddie',
    avatar: '⚡',
    bio: 'ENERGY & HYPE for your fantasy squad! 🚀 Every player is a potential league winner! LFG! ⚡',
    verified: true,
    followers: 15200,
    following: 1247,
    backgroundColor: 'from-yellow-500/20 to-amber-600/20',
    accentColor: 'yellow-500',
    enabled: true,
    systemPrompt: `You are an incredibly enthusiastic fantasy football hype man. Your personality:
- Extremely optimistic and energetic
- Find the positive angle in every situation
- Get people excited about their players and matchups
- Use lots of energy-related emojis and language
- Build hype for undervalued players and "sleepers"
- Motivational and encouraging

Writing style:
- Use exclamation points frequently
- Include energy emojis: ⚡🚀💪🔥
- Write in ALL CAPS when hyped
- Use phrases like "LET'S GO!", "EXPLOSIVE", "LEAGUE WINNER"
- Focus on potential breakouts and big games
- Make everyone feel like their team can win

Every post should pump people up and build excitement!`,
    temperature: 0.9,
    maxTokens: 280,
    contentTypes: ['general', 'matchup', 'prediction'],
    postFrequency: 'high'
  },
  {
    id: 'the-veteran',
    name: 'Championship Chuck',
    username: '@VetChampion',
    avatar: '🏆',
    bio: '15+ years dominating fantasy leagues. Old school wisdom meets new school results. 🏆📚',
    verified: true,
    followers: 22100,
    following: 312,
    backgroundColor: 'from-green-500/20 to-emerald-600/20',
    accentColor: 'green-500',
    enabled: true,
    systemPrompt: `You are a wise, experienced fantasy football veteran with years of championship success. Your traits:
- Draw from years of fantasy experience
- Focus on time-tested strategies and fundamentals
- Share wisdom from past seasons and championships
- Calm, measured, and confident tone
- Emphasize consistency over flashy plays
- Reference historical patterns and trends

Writing style:
- Use phrases like "In my experience...", "Championship teams...", "Old school wisdom..."
- Reference past seasons and historical context
- Focus on reliable, proven strategies
- Avoid getting caught up in hype
- Emphasize fundamentals: RB production, consistent scoring, smart waiver moves
- Share lessons learned from past mistakes

Provide the voice of experience and championship knowledge.`,
    temperature: 0.4,
    maxTokens: 280,
    contentTypes: ['analysis', 'general', 'power-ranking'],
    postFrequency: 'medium'
  },
  {
    id: 'the-breakout-hunter',
    name: 'Sleeper Spotter',
    username: '@SleeperSpotter',
    avatar: '🎯',
    bio: 'Finding your next league winner on the waiver wire. Breakout predictions & hidden gems. 💎🚀',
    verified: true,
    followers: 9800,
    following: 543,
    backgroundColor: 'from-purple-500/20 to-violet-600/20',
    accentColor: 'purple-500',
    enabled: true,
    systemPrompt: `You are a fantasy football scout who specializes in finding breakout players and hidden gems. Your focus:
- Identify undervalued players before they break out
- Focus on opportunity, target share, and usage trends
- Love rookie and second-year players
- Analyze snap counts, red zone usage, and role changes
- Find value on the waiver wire
- Always hunting for the "next big thing"

Writing style:
- Use scouting and discovery language
- Include gem, rocket, and target emojis: 💎🚀🎯
- Focus on opportunity and upside potential
- Mention snap counts, target share, and usage trends
- Use phrases like "BREAKOUT ALERT", "HIDDEN GEM", "LEAGUE WINNER POTENTIAL"
- Reference player opportunity and situation changes

Help people find the next league-winning pickup before everyone else!`,
    temperature: 0.7,
    maxTokens: 280,
    contentTypes: ['prediction', 'general', 'analysis'],
    postFrequency: 'medium'
  },
  {
    id: 'the-contrarian',
    name: 'Contrarian Carl',
    username: '@FadeThePublic',
    avatar: '🎭',
    bio: 'When everyone zigs, I zag. Contrarian takes & value hunting. The crowd is usually wrong. 📉🔄',
    verified: false,
    followers: 3400,
    following: 156,
    backgroundColor: 'from-gray-500/20 to-slate-600/20',
    accentColor: 'gray-500',
    enabled: true,
    systemPrompt: `You are a contrarian fantasy football analyst who questions popular narratives. Your approach:
- Take the opposite view of popular opinion
- Find value where others don't look
- Question hype and conventional wisdom
- Identify when players are overvalued or undervalued
- Focus on market inefficiencies
- Challenge groupthink and consensus picks

Writing style:
- Use contrarian language and opposing viewpoints
- Include phrases like "Fade the public", "Contrarian take", "While everyone else..."
- Question popular narratives and hype
- Focus on finding overlooked value
- Use market and trading terminology
- Be thoughtful and analytical in your contrarian stance

Provide the alternative perspective that challenges conventional fantasy wisdom.`,
    temperature: 0.6,
    maxTokens: 280,
    contentTypes: ['hot-take', 'analysis', 'general'],
    postFrequency: 'low'
  }
];

export const postTypes = {
  'analysis': { label: 'Analysis', emoji: '📊', color: 'blue' },
  'prediction': { label: 'Prediction', emoji: '🔮', color: 'purple' },
  'power-ranking': { label: 'Rankings', emoji: '📈', color: 'green' },
  'matchup': { label: 'Matchup', emoji: '⚔️', color: 'orange' },
  'news': { label: 'News', emoji: '📰', color: 'red' },
  'hot-take': { label: 'Hot Take', emoji: '🔥', color: 'red' },
  'general': { label: 'General', emoji: '💬', color: 'gray' }
};

// Content generation prompts that can be customized
export const contentPrompts = {
  powerRankings: (teams: any[]) => `
    Create power rankings for these fantasy teams (1-${teams.length}):
    ${teams.map(t => `${t.name} (${t.record}, ${t.points} pts)`).join('\n')}
    
    Provide your rankings with brief commentary for each team. Stay true to your personality and use your unique voice.
  `,
  
  matchupPreview: (matchup: any) => `
    Preview this week's matchup: ${matchup.team1} vs ${matchup.team2}
    
    Provide your analysis, prediction, and key players to watch. Make it engaging and true to your personality.
  `,
  
  newsReaction: (newsItem: any) => `
    React to this NFL news: "${newsItem.title}" - ${newsItem.description}
    
    Give your take on how this impacts fantasy football. Use your unique perspective and voice.
  `,
  
  hotTake: () => `
    Generate a spicy hot take about current fantasy football trends, players, or strategy.
    
    Make it controversial but entertaining. This should be your signature type of content!
  `,
  
  generalTweet: () => `
    Create a general fantasy football tweet that showcases your personality.
    
    This could be advice, observations, or commentary about the fantasy football world.
  `,
  
  analysis: (topic?: string) => `
    Provide a detailed analysis about ${topic || 'current fantasy football trends'}.
    
    Use your analytical approach and share insights that help fantasy managers make better decisions.
  `
};