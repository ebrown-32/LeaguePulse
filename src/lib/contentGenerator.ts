import { type AIAgent, type AgentPost } from '@/config/aiAgents';
import { sleeperAPI } from './sleeperApi';
import { newsService, type NewsItem } from './newsService';
import { llmService } from './llmService';
import { storage } from './hybridStorage';
import { createAgentToolService, type ToolResult } from './agentTools';

export interface ContentContext {
  leagueId: string;
  leagueData?: any;
  trendingPlayers?: any[];
  recentNews?: NewsItem[];
  currentWeek?: number;
  nflState?: any;
}

export class IntelligentContentGenerator {
  private leagueId: string;
  private toolService: any;

  constructor(leagueId: string) {
    this.leagueId = leagueId;
    this.toolService = createAgentToolService(leagueId);
  }

  async generateContextualContent(agent: AIAgent, type: AgentPost['type']): Promise<AgentPost | null> {
    try {
      // Use agent's configured tools to gather data
      const toolData = await this.executeAgentTools(agent, type);
      
      // Gather additional context
      const context = await this.gatherRealContext();
      
      // Enhanced context with tool data
      const enhancedContext = {
        ...context,
        toolResults: toolData,
        availableData: this.summarizeAvailableData(toolData)
      };
      
      // Generate LLM prompt based on agent, type, and tool results
      const prompt = this.buildEnhancedPrompt(agent, type, enhancedContext);
      
      // Get content from LLM
      const llmResponse = await llmService.generateContent(agent, prompt, enhancedContext);
      
      // Create post with enhanced context
      const post: AgentPost = {
        id: `${agent.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        agentId: agent.id,
        content: llmResponse.content,
        type,
        timestamp: new Date(),
        likes: Math.floor(Math.random() * 5),
        retweets: Math.floor(Math.random() * 3),
        replies: Math.floor(Math.random() * 2),
        featured: type === 'power-ranking' || Math.random() < 0.1,
        hashtags: this.generateHashtags(type, enhancedContext),
        mentions: this.generateMentions(enhancedContext)
      };

      // Store the post
      await storage.addPost(post);
      
      return post;
    } catch (error) {
      console.error('Error generating contextual content:', error);
      throw error;
    }
  }

  private async executeAgentTools(agent: AIAgent, type: AgentPost['type']): Promise<ToolResult[]> {
    const enabledTools = agent.tools?.filter(tool => tool.enabled) || [];
    const relevantTools = this.selectRelevantTools(enabledTools, type);
    
    const toolResults = [];
    
    for (const tool of relevantTools.slice(0, 3)) { // Limit to 3 tools per generation
      try {
        const result = await this.toolService.executeTool(tool.id, tool.parameters || {});
        if (result.success) {
          toolResults.push(result);
        }
      } catch (error) {
        console.error(`Tool ${tool.id} failed:`, error);
      }
    }
    
    return toolResults;
  }

  private selectRelevantTools(tools: any[], type: AgentPost['type']): any[] {
    const typeToolMapping = {
      'power-ranking': ['get-league-standings', 'power-rankings-generator', 'get-playoff-picture'],
      'matchup': ['get-current-matchups', 'get-specific-matchup', 'matchup-predictor', 'get-close-games'],
      'analysis': ['get-league-standings', 'get-player-stats', 'get-waiver-trends', 'fantasy-analysis-search'],
      'prediction': ['matchup-predictor', 'get-current-matchups', 'get-playoff-picture'],
      'news': ['nfl-news-search', 'sleeper-news-monitor', 'web-search'],
      'hot-take': ['get-league-standings', 'get-close-games', 'web-search'],
      'general': ['get-league-standings', 'get-current-matchups', 'get-waiver-trends']
    };
    
    const relevantToolIds = typeToolMapping[type] || ['get-league-standings'];
    return tools.filter(tool => relevantToolIds.includes(tool.id));
  }

  private summarizeAvailableData(toolResults: ToolResult[]): string {
    const summaries = toolResults
      .filter(result => result.success && result.summary)
      .map(result => result.summary);
    
    return summaries.length > 0 
      ? `Available data: ${summaries.join(' | ')}` 
      : 'Basic league data available';
  }

  private buildEnhancedPrompt(agent: AIAgent, type: AgentPost['type'], context: any): string {
    const { toolResults, availableData } = context;
    
    let basePrompt = this.getBasePromptForType(type, context);
    
    // Add tool data to prompt
    let toolContext = '\n\nREAL-TIME DATA:\n';
    
    toolResults.forEach((result: ToolResult, index: number) => {
      if (result.success && result.data) {
        toolContext += `\nData ${index + 1}: ${result.summary}\n`;
        
        // Add specific data snippets based on tool type
        if (result.data.standings) {
          toolContext += `Top 3 teams: ${result.data.standings.slice(0, 3).map((t: any) => `${t.teamName} (${t.record})`).join(', ')}\n`;
        }
        
        if (result.data.matchups) {
          toolContext += `This week's matchups: ${result.data.matchups.length} games\n`;
        }
        
        if (result.data.closeGames) {
          toolContext += `Close games: ${result.data.closeGames.length} within ${result.data.threshold} points\n`;
        }
        
        if (result.data.powerRankings) {
          toolContext += `Power Rankings: ${result.data.powerRankings.slice(0, 3).map((t: any) => `${t.rank}. ${t.teamName}`).join(', ')}\n`;
        }
        
        if (result.data.results && result.data.query) {
          toolContext += `Search results for "${result.data.query}": ${result.data.totalResults} found\n`;
        }
      }
    });
    
    const fullPrompt = `${basePrompt}${toolContext}\n\nIMPORTANT: Use the real-time data above to create authentic, data-driven content. Reference specific teams, scores, and facts from the data. Stay true to your personality as ${agent.name} (${agent.username}).`;
    
    return fullPrompt;
  }

  private getBasePromptForType(type: AgentPost['type'], context: any): string {
    switch (type) {
      case 'power-ranking':
        return 'Create power rankings for the league teams based on current standings and performance. Rank teams with brief commentary focusing on recent trends.';
      
      case 'matchup':
        return 'Analyze current week matchups and provide predictions. Focus on close games, key players, and upset potential.';
      
      case 'analysis':
        return 'Provide detailed fantasy football analysis using current data. Focus on trends, player performance, and strategic insights.';
      
      case 'prediction':
        return 'Make bold predictions about upcoming games, player performances, or league outcomes based on current data and trends.';
      
      case 'news':
        return 'React to recent NFL news and analyze its fantasy football implications. Connect news to your league when relevant.';
      
      case 'hot-take':
        return 'Generate a spicy, controversial hot take about current league standings, performances, or fantasy football trends.';
      
      case 'general':
        return 'Share fantasy football insights, league observations, or motivational content based on current league dynamics.';
      
      default:
        return 'Create engaging fantasy football content based on current league data and trends.';
    }
  }

  private async gatherRealContext(): Promise<ContentContext> {
    try {
      const [leagueData, recentNews, trendingAdds, trendingDrops, nflState] = await Promise.all([
        sleeperAPI.getLeagueAnalysis(this.leagueId),
        newsService.getLatestNews(10),
        sleeperAPI.fetchTrendingPlayers('add', 24, 10),
        sleeperAPI.fetchTrendingPlayers('drop', 24, 10),
        sleeperAPI.fetchNFLState()
      ]);

      return {
        leagueId: this.leagueId,
        leagueData,
        recentNews,
        trendingPlayers: [...trendingAdds, ...trendingDrops],
        currentWeek: nflState.week,
        nflState
      };
    } catch (error) {
      console.error('Error gathering real context:', error);
      throw new Error('Failed to gather league context data');
    }
  }

  private buildContextualPrompt(agent: AIAgent, type: AgentPost['type'], context: ContentContext): string {
    const { leagueData, recentNews, trendingPlayers, currentWeek } = context;

    let basePrompt = '';
    let dataContext = '';

    // Build data context
    if (leagueData) {
      const { teams, currentMatchups, insights } = leagueData;
      dataContext += `\nLEAGUE DATA:\n`;
      dataContext += `Current Week: ${currentWeek}\n`;
      dataContext += `League Standings:\n${teams.slice(0, 8).map((team: any, i: number) => 
        `${i + 1}. ${team.owner} (${team.record}) - ${team.points_for.toFixed(1)} pts`
      ).join('\n')}\n`;
      
      if (currentMatchups?.length > 0) {
        dataContext += `\nCurrent Matchups:\n${currentMatchups.slice(0, 3).map((m: any) => 
          `${m.team1.owner} vs ${m.team2.owner} (${m.team1_points} - ${m.team2_points})`
        ).join('\n')}\n`;
      }

      dataContext += `\nLeague Insights: ${insights.competitiveBalance} competition, avg ${insights.averagePoints} PPG\n`;
    }

    if (recentNews && recentNews.length > 0) {
      dataContext += `\nRECENT NFL NEWS:\n${recentNews.slice(0, 5).map((news: NewsItem) => 
        `- ${news.title} (${news.source}, ${news.impact} impact)`
      ).join('\n')}\n`;
    }

    if (trendingPlayers && trendingPlayers.length > 0) {
      dataContext += `\nTRENDING PLAYERS: ${trendingPlayers.slice(0, 5).map((p: any) => p.player_id || p).join(', ')}\n`;
    }

    // Type-specific prompts
    switch (type) {
      case 'power-ranking':
        basePrompt = `Create power rankings for the league teams based on current standings and performance. Rank all teams 1-${leagueData?.teams?.length || 8} with brief commentary for each. Focus on recent performance trends and playoff implications.`;
        break;

      case 'matchup':
        if (context.leagueData?.currentMatchups?.length > 0) {
          const matchup = context.leagueData.currentMatchups[0];
          basePrompt = `Preview the matchup between ${matchup.team1.owner} (${matchup.team1.record}) vs ${matchup.team2.owner} (${matchup.team2.record}). Current score: ${matchup.team1_points} - ${matchup.team2_points}. Provide analysis and prediction.`;
        } else {
          basePrompt = `Discuss the competitive landscape and key matchups to watch this week based on current league standings.`;
        }
        break;

      case 'hot-take':
        basePrompt = `Generate a spicy, controversial hot take about the current league standings, recent performances, or fantasy football in general. Be bold and opinionated while staying entertaining.`;
        break;

      case 'analysis':
        basePrompt = `Provide analytical insights about current league trends, player performances, or strategic observations. Use data to support your analysis.`;
        break;

      case 'prediction':
        basePrompt = `Make bold predictions about upcoming games, player performances, or league outcomes based on current trends and data.`;
        break;

      case 'news':
        if (recentNews && recentNews.length > 0) {
          const news = recentNews[Math.floor(Math.random() * Math.min(3, recentNews.length))];
          basePrompt = `React to this NFL news: "${news.title}" - ${news.description}. Discuss the fantasy football implications and impact on lineups.`;
        } else {
          basePrompt = `Share thoughts on recent NFL developments and their fantasy football implications.`;
        }
        break;

      case 'general':
        basePrompt = `Share general fantasy football wisdom, league observations, or motivational content based on current league dynamics.`;
        break;

      default:
        basePrompt = `Create engaging fantasy football content based on current league data and trends.`;
    }

    return `${basePrompt}\n${dataContext}\n\nRemember: You are ${agent.name} (${agent.username}). Stay true to your personality and catchphrase. Keep it under ${agent.maxTokens} characters and make it engaging for social media.`;
  }

  private generateHashtags(type: AgentPost['type'], context: ContentContext): string[] {
    const baseHashtags = ['#FantasyFootball'];
    
    const typeHashtags = {
      'power-ranking': ['#PowerRankings', '#LeagueUpdate', '#Rankings'],
      'matchup': ['#MatchupPreview', '#GameDay', '#H2H'],
      'hot-take': ['#HotTake', '#Controversial', '#BoldTake'],
      'analysis': ['#FantasyAnalysis', '#DataDriven', '#Insights'],
      'prediction': ['#Prediction', '#BoldTake', '#Fantasy'],
      'news': ['#NFLNews', '#FantasyImpact', '#Breaking'],
      'general': ['#FantasyLife', '#LeagueChat', '#FF']
    };

    const hashtags = [...baseHashtags, ...(typeHashtags[type] || [])];

    // Add week-specific hashtag
    if (context.currentWeek) {
      hashtags.push(`#Week${context.currentWeek}`);
    }

    // Add competitive balance hashtag
    if (context.leagueData?.insights?.competitiveBalance) {
      const balance = context.leagueData.insights.competitiveBalance;
      if (balance === 'tight') hashtags.push('#TightRace');
      else if (balance === 'blowout') hashtags.push('#Runaway');
    }

    return hashtags;
  }

  private generateMentions(context: ContentContext): string[] {
    // Could mention team owners or league-specific handles
    // For now, keep empty - could be enhanced with league member handles
    return [];
  }
}

// Automated content generation scheduler
export class ContentScheduler {
  private generators: Map<string, IntelligentContentGenerator> = new Map();
  private isRunning = false;

  addLeague(leagueId: string) {
    if (!this.generators.has(leagueId)) {
      this.generators.set(leagueId, new IntelligentContentGenerator(leagueId));
    }
  }

  async generateRandomContent(leagueId: string, enabledAgents: AIAgent[]): Promise<AgentPost[]> {
    const generator = this.generators.get(leagueId);
    if (!generator || enabledAgents.length === 0) {
      throw new Error('No generator or enabled agents found');
    }

    const posts: AgentPost[] = [];
    const contentTypes: AgentPost['type'][] = ['analysis', 'hot-take', 'matchup', 'news', 'prediction', 'general', 'power-ranking'];
    
    // Generate 2-3 posts
    const numPosts = Math.floor(Math.random() * 2) + 2;
    
    for (let i = 0; i < numPosts; i++) {
      const randomAgent = this.selectAgentByFrequency(enabledAgents);
      const preferredTypes = randomAgent.contentTypes.length > 0 ? randomAgent.contentTypes : contentTypes;
      const randomType = preferredTypes[Math.floor(Math.random() * preferredTypes.length)];
      
      try {
        const post = await generator.generateContextualContent(randomAgent, randomType);
        if (post) {
          posts.push(post);
        }
      } catch (error) {
        console.error(`Failed to generate content for ${randomAgent.name}:`, error);
        // Don't continue if LLM fails - we want real content only
        break;
      }

      // Small delay between posts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return posts;
  }

  private selectAgentByFrequency(agents: AIAgent[]): AIAgent {
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

  async runScheduledGeneration(leagueId: string, enabledAgents: AIAgent[]) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    try {
      await this.generateRandomContent(leagueId, enabledAgents);
      console.log(`Generated scheduled content for league ${leagueId}`);
    } catch (error) {
      console.error('Error in scheduled content generation:', error);
      throw error; // Re-throw for proper error handling
    } finally {
      this.isRunning = false;
    }
  }
}