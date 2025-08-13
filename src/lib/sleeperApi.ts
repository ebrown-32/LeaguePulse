import { leagueCache } from './storage';

const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  season_type: string;
  total_rosters: number;
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  settings: {
    playoff_week_start: number;
    last_scored_leg: number;
    leg: number;
  };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_against: number;
    fpts_decimal: number;
    fpts_against_decimal: number;
  };
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  starters: string[];
  players_points: Record<string, number>;
}

export interface PlayerInfo {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  status: string;
  fantasy_positions: string[];
}

class SleeperAPI {
  private playerCache: Map<string, PlayerInfo> = new Map();
  private playerCacheTimestamp = 0;
  private playerCacheTimeout = 24 * 60 * 60 * 1000; // 24 hours

  async fetchLeague(leagueId: string): Promise<SleeperLeague> {
    const response = await fetch(`${SLEEPER_BASE_URL}/league/${leagueId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch league: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchRosters(leagueId: string): Promise<SleeperRoster[]> {
    const response = await fetch(`${SLEEPER_BASE_URL}/league/${leagueId}/rosters`);
    if (!response.ok) {
      throw new Error(`Failed to fetch rosters: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchUsers(leagueId: string): Promise<SleeperUser[]> {
    const response = await fetch(`${SLEEPER_BASE_URL}/league/${leagueId}/users`);
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    const response = await fetch(`${SLEEPER_BASE_URL}/league/${leagueId}/matchups/${week}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch matchups: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchPlayers(): Promise<Record<string, PlayerInfo>> {
    // Check cache first
    if (Date.now() - this.playerCacheTimestamp < this.playerCacheTimeout && this.playerCache.size > 0) {
      return Object.fromEntries(this.playerCache);
    }

    const response = await fetch(`${SLEEPER_BASE_URL}/players/nfl`);
    if (!response.ok) {
      throw new Error(`Failed to fetch players: ${response.statusText}`);
    }
    
    const players = await response.json();
    
    // Update cache
    this.playerCache.clear();
    for (const [playerId, playerData] of Object.entries(players)) {
      this.playerCache.set(playerId, playerData as PlayerInfo);
    }
    this.playerCacheTimestamp = Date.now();
    
    return players;
  }

  async fetchNFLState(): Promise<any> {
    const response = await fetch(`${SLEEPER_BASE_URL}/state/nfl`);
    if (!response.ok) {
      throw new Error(`Failed to fetch NFL state: ${response.statusText}`);
    }
    return response.json();
  }

  async fetchTrendingPlayers(type: 'add' | 'drop' = 'add', lookback_hours = 24, limit = 25): Promise<any[]> {
    const response = await fetch(
      `${SLEEPER_BASE_URL}/players/nfl/trending/${type}?lookback_hours=${lookback_hours}&limit=${limit}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch trending players: ${response.statusText}`);
    }
    return response.json();
  }

  // Enhanced league data with analysis
  async getLeagueAnalysis(leagueId: string): Promise<any> {
    // Try cache first
    const cached = await leagueCache.getLeagueData(leagueId);
    if (cached) {
      return this.analyzeLeagueData(cached);
    }

    // Fetch fresh data
    const [league, rosters, users, nflState] = await Promise.all([
      this.fetchLeague(leagueId),
      this.fetchRosters(leagueId),
      this.fetchUsers(leagueId),
      this.fetchNFLState()
    ]);

    const currentWeek = nflState.week;
    const matchups = await this.fetchMatchups(leagueId, currentWeek);

    const leagueData = {
      league,
      rosters,
      users,
      matchups
    };

    // Cache the data
    await leagueCache.setLeagueData(leagueId, leagueData);

    return this.analyzeLeagueData(leagueData);
  }

  private analyzeLeagueData(data: any) {
    const { league, rosters, users, matchups } = data;

    // Create user lookup
    const userLookup = new Map();
    users.forEach((user: SleeperUser) => {
      userLookup.set(user.user_id, user);
    });

    // Analyze teams
    const teams = rosters.map((roster: SleeperRoster) => {
      const user = userLookup.get(roster.owner_id);
      return {
        roster_id: roster.roster_id,
        owner: user ? user.display_name || user.username : 'Unknown',
        wins: roster.settings.wins,
        losses: roster.settings.losses,
        ties: roster.settings.ties,
        points_for: roster.settings.fpts + (roster.settings.fpts_decimal || 0),
        points_against: roster.settings.fpts_against + (roster.settings.fpts_against_decimal || 0),
        players: roster.players,
        starters: roster.starters,
        record: `${roster.settings.wins}-${roster.settings.losses}${roster.settings.ties > 0 ? `-${roster.settings.ties}` : ''}`
      };
    });

    // Sort by wins, then by points
    teams.sort((a: any, b: any) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      return b.points_for - a.points_for;
    });

    // Current matchups analysis
    const currentMatchups = this.analyzeMatchups(matchups, teams);

    // League insights
    const insights = this.generateLeagueInsights(teams, league);

    return {
      league,
      teams,
      currentMatchups,
      insights,
      lastUpdated: new Date()
    };
  }

  private analyzeMatchups(matchups: SleeperMatchup[], teams: any[]) {
    const teamLookup = new Map();
    teams.forEach(team => teamLookup.set(team.roster_id, team));

    const matchupPairs = new Map();
    
    matchups.forEach(matchup => {
      const matchupId = matchup.matchup_id;
      if (!matchupPairs.has(matchupId)) {
        matchupPairs.set(matchupId, []);
      }
      matchupPairs.get(matchupId).push({
        ...matchup,
        team: teamLookup.get(matchup.roster_id)
      });
    });

    return Array.from(matchupPairs.values()).map(pair => {
      if (pair.length === 2) {
        return {
          team1: pair[0].team,
          team2: pair[1].team,
          team1_points: pair[0].points,
          team2_points: pair[1].points,
          projected_winner: pair[0].points > pair[1].points ? pair[0].team : pair[1].team,
          point_differential: Math.abs(pair[0].points - pair[1].points)
        };
      }
      return null;
    }).filter(Boolean);
  }

  private generateLeagueInsights(teams: any[], league: SleeperLeague) {
    const totalGames = teams[0]?.wins + teams[0]?.losses + teams[0]?.ties || 0;
    const averagePoints = teams.reduce((sum, team) => sum + team.points_for, 0) / teams.length;
    
    // Find interesting storylines
    const highestScoring = teams.reduce((prev, current) => 
      (prev.points_for > current.points_for) ? prev : current
    );
    
    const mostWins = teams[0]; // Already sorted by wins
    const leastWins = teams[teams.length - 1];
    
    const unluckyTeam = teams.reduce((prev, current) => {
      const prevRatio = prev.points_for / (prev.points_against || 1);
      const currentRatio = current.points_for / (current.points_against || 1);
      return (currentRatio > prevRatio && current.wins < prev.wins) ? current : prev;
    });

    return {
      totalGames,
      averagePoints: Math.round(averagePoints * 100) / 100,
      highestScoring,
      mostWins,
      leastWins,
      unluckyTeam,
      isPlayoffTime: totalGames >= (league.settings.playoff_week_start || 14),
      competitiveBalance: this.calculateCompetitiveBalance(teams)
    };
  }

  private calculateCompetitiveBalance(teams: any[]): 'tight' | 'moderate' | 'blowout' {
    const winCounts = teams.map(team => team.wins);
    const maxWins = Math.max(...winCounts);
    const minWins = Math.min(...winCounts);
    const winSpread = maxWins - minWins;
    
    if (winSpread <= 2) return 'tight';
    if (winSpread <= 4) return 'moderate';
    return 'blowout';
  }
}

export const sleeperAPI = new SleeperAPI();