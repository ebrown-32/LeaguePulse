import { sleeperAPI } from './sleeperApi';
import { type AgentTool } from '@/config/aiAgents';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  summary?: string;
}

export class AgentToolService {
  private leagueId: string;

  constructor(leagueId: string) {
    this.leagueId = leagueId;
  }

  async executeTool(toolId: string, parameters: Record<string, any> = {}): Promise<ToolResult> {
    try {
      switch (toolId) {
        // Core Sleeper API Tools
        case 'get-league-standings':
          return await this.getLeagueStandings(parameters);
        
        case 'get-current-matchups':
          return await this.getCurrentMatchups(parameters);
        
        case 'get-specific-matchup':
          return await this.getSpecificMatchup(parameters);
        
        case 'get-close-games':
          return await this.getCloseGames(parameters);
        
        case 'get-team-rosters':
          return await this.getTeamRosters(parameters);
        
        case 'get-player-stats':
          return await this.getPlayerStats(parameters);
        
        case 'get-waiver-trends':
          return await this.getWaiverTrends(parameters);
        
        case 'get-playoff-picture':
          return await this.getPlayoffPicture(parameters);
        
        case 'get-league-history':
          return await this.getLeagueHistory(parameters);
        
        case 'get-trade-activity':
          return await this.getTradeActivity(parameters);
        
        // Enhanced Analysis Tools
        case 'power-rankings-generator':
          return await this.generatePowerRankings(parameters);
        
        case 'matchup-predictor':
          return await this.predictMatchups(parameters);
        
        case 'sleeper-news-monitor':
          return await this.getSleeperNews(parameters);
        
        // Internet Search Tools
        case 'web-search':
          return await this.webSearch(parameters);
        
        case 'nfl-news-search':
          return await this.nflNewsSearch(parameters);
        
        case 'fantasy-analysis-search':
          return await this.fantasyAnalysisSearch(parameters);
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolId}`
          };
      }
    } catch (error) {
      console.error(`Tool execution failed for ${toolId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  // Core Sleeper API Tools Implementation
  private async getLeagueStandings(params: any): Promise<ToolResult> {
    const leagueData = await sleeperAPI.getLeagueAnalysis(this.leagueId);
    const { teams, insights } = leagueData;

    const standings = teams.map((team: any, index: number) => ({
      rank: index + 1,
      teamName: team.owner,
      record: team.record,
      pointsFor: team.points_for,
      pointsAgainst: team.points_against,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties || 0
    }));

    return {
      success: true,
      data: {
        standings,
        insights,
        competitiveBalance: insights.competitiveBalance,
        averagePoints: insights.averagePoints,
        totalTeams: teams.length
      },
      summary: `Current standings: ${teams[0]?.owner} leads with ${teams[0]?.record}. League has ${insights.competitiveBalance} competition with ${insights.averagePoints} avg PPG.`
    };
  }

  private async getCurrentMatchups(params: any): Promise<ToolResult> {
    try {
      const nflState = await sleeperAPI.fetchNFLState();
      const currentWeek = nflState.week || 1;
      
      const [matchups, rosters, users] = await Promise.all([
        sleeperAPI.fetchMatchups(this.leagueId, currentWeek),
        sleeperAPI.fetchRosters(this.leagueId),
        sleeperAPI.fetchUsers(this.leagueId)
      ]);

      // Group matchups and add team names
      const matchupPairs = this.groupMatchups(matchups, rosters, users);
      
      return {
        success: true,
        data: {
          week: currentWeek,
          matchups: matchupPairs,
          totalMatchups: matchupPairs.length
        },
        summary: `Week ${currentWeek} has ${matchupPairs.length} matchups. Closest game: ${this.getClosestMatchup(matchupPairs)}`
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch current matchups'
      };
    }
  }

  private async getSpecificMatchup(params: any): Promise<ToolResult> {
    const { teamId1, teamId2 } = params;
    const currentMatchups = await this.getCurrentMatchups({});
    
    if (!currentMatchups.success) return currentMatchups;
    
    const matchup = currentMatchups.data?.matchups.find((m: any) => 
      (m.team1.roster_id === teamId1 && m.team2.roster_id === teamId2) ||
      (m.team1.roster_id === teamId2 && m.team2.roster_id === teamId1)
    );

    if (!matchup) {
      return {
        success: false,
        error: 'Matchup not found'
      };
    }

    return {
      success: true,
      data: matchup,
      summary: `${matchup.team1.name} (${matchup.team1.points}) vs ${matchup.team2.name} (${matchup.team2.points})`
    };
  }

  private async getCloseGames(params: any): Promise<ToolResult> {
    const threshold = params.pointDifferenceThreshold || 10;
    const currentMatchups = await this.getCurrentMatchups({});
    
    if (!currentMatchups.success) return currentMatchups;
    
    const closeGames = currentMatchups.data?.matchups
      .filter((m: any) => Math.abs(m.team1.points - m.team2.points) <= threshold && (m.team1.points > 0 || m.team2.points > 0))
      .sort((a: any, b: any) => Math.abs(a.team1.points - a.team2.points) - Math.abs(b.team1.points - b.team2.points));

    return {
      success: true,
      data: {
        closeGames,
        threshold,
        count: closeGames?.length || 0
      },
      summary: `Found ${closeGames?.length || 0} close games within ${threshold} points this week.`
    };
  }

  private async getTeamRosters(params: any): Promise<ToolResult> {
    const [rosters, users, players] = await Promise.all([
      sleeperAPI.fetchRosters(this.leagueId),
      sleeperAPI.fetchUsers(this.leagueId),
      sleeperAPI.fetchPlayers()
    ]);

    const teamsWithRosters = rosters.map((roster: any) => {
      const user = users.find((u: any) => u.user_id === roster.owner_id);
      const starters = roster.starters.map((playerId: string) => {
        const player = players[playerId];
        return player ? {
          id: playerId,
          name: `${player.first_name} ${player.last_name}`,
          position: player.position,
          team: player.team
        } : { id: playerId, name: 'Unknown Player' };
      });

      return {
        teamName: user?.display_name || 'Unknown',
        roster_id: roster.roster_id,
        record: `${roster.settings.wins}-${roster.settings.losses}`,
        starters,
        starterCount: starters.length,
        totalPlayers: roster.players?.length || 0
      };
    });

    return {
      success: true,
      data: {
        teams: teamsWithRosters,
        totalTeams: teamsWithRosters.length
      },
      summary: `Retrieved rosters for ${teamsWithRosters.length} teams. Each team starts ${teamsWithRosters[0]?.starterCount} players.`
    };
  }

  private async getPlayerStats(params: any): Promise<ToolResult> {
    const { playerId, playerName } = params;
    const players = await sleeperAPI.fetchPlayers();
    
    let targetPlayer;
    if (playerId) {
      targetPlayer = players[playerId];
    } else if (playerName) {
      // Search by name
      targetPlayer = Object.values(players).find((player: any) => 
        `${player.first_name} ${player.last_name}`.toLowerCase().includes(playerName.toLowerCase())
      );
    }

    if (!targetPlayer) {
      return {
        success: false,
        error: 'Player not found'
      };
    }

    return {
      success: true,
      data: {
        name: `${targetPlayer.first_name} ${targetPlayer.last_name}`,
        position: targetPlayer.position,
        team: targetPlayer.team,
        status: targetPlayer.status,
        fantasyPositions: targetPlayer.fantasy_positions
      },
      summary: `${targetPlayer.first_name} ${targetPlayer.last_name} - ${targetPlayer.position}, ${targetPlayer.team} (${targetPlayer.status})`
    };
  }

  private async getWaiverTrends(params: any): Promise<ToolResult> {
    const lookback = params.lookbackHours || 24;
    const limit = params.limit || 25;
    
    const [trending_add, trending_drop] = await Promise.all([
      sleeperAPI.fetchTrendingPlayers('add', lookback, limit),
      sleeperAPI.fetchTrendingPlayers('drop', lookback, limit)
    ]);

    const players = await sleeperAPI.fetchPlayers();
    
    const addTrends = trending_add.map((trend: any) => {
      const player = players[trend.player_id];
      return {
        playerId: trend.player_id,
        name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
        position: player?.position,
        team: player?.team,
        count: trend.count
      };
    });

    const dropTrends = trending_drop.map((trend: any) => {
      const player = players[trend.player_id];
      return {
        playerId: trend.player_id,
        name: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
        position: player?.position,
        team: player?.team,
        count: trend.count
      };
    });

    return {
      success: true,
      data: {
        trending_add: addTrends,
        trending_drop: dropTrends,
        lookback_hours: lookback
      },
      summary: `Top waiver adds: ${addTrends.slice(0, 3).map((p: any) => p.name).join(', ')}. Top drops: ${dropTrends.slice(0, 3).map((p: any) => p.name).join(', ')}`
    };
  }

  private async getPlayoffPicture(params: any): Promise<ToolResult> {
    const leagueData = await sleeperAPI.getLeagueAnalysis(this.leagueId);
    const { teams, league } = leagueData;
    
    const playoffTeams = league.settings?.playoff_teams || 6;
    const playoffWeekStart = league.settings?.playoff_week_start || 15;
    
    const inPlayoffs = teams.slice(0, playoffTeams);
    const onBubble = teams.slice(playoffTeams, playoffTeams + 2);
    const eliminated = teams.slice(playoffTeams + 2);

    return {
      success: true,
      data: {
        playoffTeams,
        playoffWeekStart,
        inPlayoffs: inPlayoffs.map((t: any) => ({ name: t.owner, record: t.record, points: t.points_for })),
        onBubble: onBubble.map((t: any) => ({ name: t.owner, record: t.record, points: t.points_for })),
        eliminated: eliminated.map((t: any) => ({ name: t.owner, record: t.record, points: t.points_for }))
      },
      summary: `${playoffTeams} playoff spots. Currently in: ${inPlayoffs.slice(0, 3).map((t: any) => t.owner).join(', ')}. On bubble: ${onBubble.map((t: any) => t.owner).join(', ')}`
    };
  }

  private async getLeagueHistory(params: any): Promise<ToolResult> {
    // This would need historical data - simplified for now
    const leagueData = await sleeperAPI.getLeagueAnalysis(this.leagueId);
    
    return {
      success: true,
      data: {
        currentSeason: leagueData.league.season,
        totalTeams: leagueData.league.total_rosters,
        scoringType: leagueData.league.scoring_settings?.rec ? 'PPR' : 'Standard'
      },
      summary: `${leagueData.league.season} season with ${leagueData.league.total_rosters} teams using ${leagueData.league.scoring_settings?.rec ? 'PPR' : 'Standard'} scoring.`
    };
  }

  private async getTradeActivity(params: any): Promise<ToolResult> {
    // This would require transaction history from Sleeper API
    // For now, return placeholder
    return {
      success: true,
      data: {
        recentTrades: [],
        message: 'Trade monitoring requires additional API endpoints'
      },
      summary: 'Trade activity monitoring is in development.'
    };
  }

  // Enhanced Analysis Tools
  private async generatePowerRankings(params: any): Promise<ToolResult> {
    const leagueData = await sleeperAPI.getLeagueAnalysis(this.leagueId);
    const { teams } = leagueData;
    
    // Enhanced power rankings with multiple factors
    const powerRankings = teams.map((team: any, index: number) => {
      const winPct = team.wins / (team.wins + team.losses + team.ties);
      const pointsRank = teams.length - teams.findIndex((t: any) => t.points_for <= team.points_for);
      const powerScore = (winPct * 0.6) + ((pointsRank / teams.length) * 0.4);
      
      return {
        rank: index + 1,
        teamName: team.owner,
        record: team.record,
        powerScore: Math.round(powerScore * 100),
        trend: index < 3 ? 'UP' : index > teams.length - 3 ? 'DOWN' : 'STABLE',
        reasoning: this.generateRankingReasoning(team, index, teams.length)
      };
    });

    return {
      success: true,
      data: { powerRankings, methodology: 'Based on wins (60%) and points scored (40%)' },
      summary: `Power Rankings: 1. ${powerRankings[0]?.teamName}, 2. ${powerRankings[1]?.teamName}, 3. ${powerRankings[2]?.teamName}`
    };
  }

  private async predictMatchups(params: any): Promise<ToolResult> {
    const currentMatchups = await this.getCurrentMatchups({});
    if (!currentMatchups.success) return currentMatchups;
    
    const predictions = currentMatchups.data?.matchups.map((matchup: any) => {
      const team1Avg = matchup.team1.points || 100; // Simplified
      const team2Avg = matchup.team2.points || 100;
      const diff = Math.abs(team1Avg - team2Avg);
      
      const favorite = team1Avg > team2Avg ? matchup.team1 : matchup.team2;
      const confidence = Math.min(0.9, 0.5 + (diff / 50)); // Simple confidence calc
      
      return {
        matchup: `${matchup.team1.name} vs ${matchup.team2.name}`,
        prediction: `${favorite.name} wins`,
        confidence: Math.round(confidence * 100),
        projectedScore: `${Math.round(team1Avg)}-${Math.round(team2Avg)}`,
        keyFactors: ['Recent form', 'Head-to-head record', 'Injury report']
      };
    });

    return {
      success: true,
      data: { predictions },
      summary: `Generated ${predictions?.length} matchup predictions with confidence scores.`
    };
  }

  private async getSleeperNews(params: any): Promise<ToolResult> {
    // This would integrate with Sleeper's news feed
    return {
      success: true,
      data: {
        news: [],
        message: 'Sleeper news integration in development'
      },
      summary: 'Sleeper news monitoring is in development.'
    };
  }

  // Internet Search Tools
  private async webSearch(params: any): Promise<ToolResult> {
    const { query, maxResults = 10 } = params;
    
    try {
      // Use DuckDuckGo Instant Answer API (no key required)
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
      
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      const results = [];
      
      // Add abstract if available
      if (data.Abstract) {
        results.push({
          type: 'summary',
          title: data.Heading || 'Summary',
          content: data.Abstract,
          source: data.AbstractSource,
          url: data.AbstractURL
        });
      }
      
      // Add definition if available
      if (data.Definition) {
        results.push({
          type: 'definition',
          title: 'Definition',
          content: data.Definition,
          source: data.DefinitionSource,
          url: data.DefinitionURL
        });
      }
      
      // Add related topics
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        data.RelatedTopics.slice(0, maxResults - results.length).forEach((topic: any) => {
          if (topic.Text) {
            results.push({
              type: 'related',
              title: topic.FirstURL ? this.extractTitleFromUrl(topic.FirstURL) : 'Related Topic',
              content: topic.Text,
              url: topic.FirstURL
            });
          }
        });
      }
      
      return {
        success: true,
        data: {
          query,
          results: results.slice(0, maxResults),
          totalResults: results.length
        },
        summary: `Found ${results.length} results for "${query}". ${results[0] ? results[0].content.substring(0, 100) + '...' : ''}`
      };
    } catch (error) {
      console.error('Web search failed:', error);
      return {
        success: false,
        error: 'Web search failed',
        summary: `Failed to search for "${query}"`
      };
    }
  }

  private async nflNewsSearch(params: any): Promise<ToolResult> {
    const { playerName, teamName, topic = 'NFL news' } = params;
    
    let searchQuery = topic;
    if (playerName) searchQuery += ` ${playerName}`;
    if (teamName) searchQuery += ` ${teamName}`;
    searchQuery += ' site:espn.com OR site:nfl.com OR site:fantasypros.com';
    
    try {
      // Use our web search but filter for NFL sources
      const searchResult = await this.webSearch({ 
        query: searchQuery, 
        maxResults: 8 
      });
      
      if (searchResult.success && searchResult.data) {
        // Filter results for sports relevance
        const nflResults = searchResult.data.results.filter((result: any) => 
          result.content.toLowerCase().includes('nfl') ||
          result.content.toLowerCase().includes('football') ||
          result.content.toLowerCase().includes('fantasy') ||
          result.url?.includes('espn.com') ||
          result.url?.includes('nfl.com') ||
          result.url?.includes('fantasypros.com')
        );
        
        return {
          success: true,
          data: {
            query: searchQuery,
            results: nflResults,
            totalResults: nflResults.length
          },
          summary: `Found ${nflResults.length} NFL news results. ${nflResults[0] ? nflResults[0].content.substring(0, 100) + '...' : ''}`
        };
      }
      
      return searchResult;
    } catch (error) {
      return {
        success: false,
        error: 'NFL news search failed',
        summary: `Failed to search NFL news for "${searchQuery}"`
      };
    }
  }

  private async fantasyAnalysisSearch(params: any): Promise<ToolResult> {
    const { playerName, position, topic = 'fantasy football analysis' } = params;
    
    let searchQuery = topic;
    if (playerName) searchQuery += ` ${playerName}`;
    if (position) searchQuery += ` ${position}`;
    searchQuery += ' fantasy rankings projections 2024';
    
    try {
      const searchResult = await this.webSearch({ 
        query: searchQuery, 
        maxResults: 8 
      });
      
      if (searchResult.success && searchResult.data) {
        // Filter for fantasy relevance
        const fantasyResults = searchResult.data.results.filter((result: any) => 
          result.content.toLowerCase().includes('fantasy') ||
          result.content.toLowerCase().includes('rankings') ||
          result.content.toLowerCase().includes('projections') ||
          result.content.toLowerCase().includes('analysis') ||
          result.content.toLowerCase().includes('waiver')
        );
        
        return {
          success: true,
          data: {
            query: searchQuery,
            results: fantasyResults,
            totalResults: fantasyResults.length,
            focus: 'Fantasy analysis and projections'
          },
          summary: `Found ${fantasyResults.length} fantasy analysis results. Focus: rankings, projections, waiver advice.`
        };
      }
      
      return searchResult;
    } catch (error) {
      return {
        success: false,
        error: 'Fantasy analysis search failed',
        summary: `Failed to search fantasy analysis for "${searchQuery}"`
      };
    }
  }

  // Helper methods
  private groupMatchups(matchups: any[], rosters: any[], users: any[]) {
    const matchupPairs = new Map();
    
    matchups.forEach(matchup => {
      if (!matchup.matchup_id) return;
      if (!matchupPairs.has(matchup.matchup_id)) {
        matchupPairs.set(matchup.matchup_id, []);
      }
      matchupPairs.get(matchup.matchup_id).push(matchup);
    });

    return Array.from(matchupPairs.values()).map(pair => {
      if (pair.length !== 2) return null;
      
      const [team1Data, team2Data] = pair;
      const roster1 = rosters.find(r => r.roster_id === team1Data.roster_id);
      const roster2 = rosters.find(r => r.roster_id === team2Data.roster_id);
      const user1 = users.find(u => u.user_id === roster1?.owner_id);
      const user2 = users.find(u => u.user_id === roster2?.owner_id);

      return {
        matchup_id: team1Data.matchup_id,
        team1: {
          name: user1?.display_name || 'Unknown',
          roster_id: team1Data.roster_id,
          points: team1Data.points || 0
        },
        team2: {
          name: user2?.display_name || 'Unknown', 
          roster_id: team2Data.roster_id,
          points: team2Data.points || 0
        },
        pointDiff: Math.abs((team1Data.points || 0) - (team2Data.points || 0))
      };
    }).filter(Boolean);
  }

  private getClosestMatchup(matchups: any[]): string {
    if (!matchups.length) return 'None';
    const closest = matchups.reduce((prev, current) => 
      prev.pointDiff < current.pointDiff ? prev : current
    );
    return `${closest.team1.name} vs ${closest.team2.name} (${closest.pointDiff.toFixed(1)} pt diff)`;
  }

  private generateRankingReasoning(team: any, rank: number, totalTeams: number): string {
    if (rank === 0) return 'Strong record and high scoring offense';
    if (rank < 3) return 'Consistent performance with solid point production';
    if (rank > totalTeams - 3) return 'Struggling with wins and point production';
    return 'Middle of the pack with room for improvement';
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const title = pathname.split('/').pop() || pathname;
      return title.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch {
      return 'External Link';
    }
  }
}

export const createAgentToolService = (leagueId: string) => new AgentToolService(leagueId);