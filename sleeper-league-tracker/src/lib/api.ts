import {
  SleeperLeague,
  SleeperMatchup,
  SleeperNFLState,
  SleeperRoster,
  SleeperUser,
} from "@/types/sleeper";

const BASE_URL = 'https://api.sleeper.app/v1';

// Cache for league IDs to avoid repeated API calls
let leagueIdsCache: Record<string, string[]> = {};

/**
 * Fetches all linked league IDs for a given league, including previous and future seasons
 */
export async function getAllLinkedLeagueIds(leagueId: string): Promise<string[]> {
  // Check cache first
  if (leagueIdsCache[leagueId]) {
    return leagueIdsCache[leagueId];
  }

  const linkedIds = new Set<string>();
  linkedIds.add(leagueId);

  try {
    // First, traverse backwards through previous seasons
    let currentId = leagueId;
    while (currentId) {
      const league = await getLeagueInfo(currentId);
      if (league.previous_league_id) {
        linkedIds.add(league.previous_league_id);
        currentId = league.previous_league_id;
      } else {
        break;
      }
    }

    // Then, traverse forwards through next seasons
    currentId = leagueId;
    while (currentId) {
      const leagues = await getUserLeagues(currentId);
      const nextLeague = leagues.find(l => l.previous_league_id === currentId);
      if (nextLeague) {
        linkedIds.add(nextLeague.league_id);
        currentId = nextLeague.league_id;
      } else {
        break;
      }
    }

    // Convert to array and sort by season (most recent first)
    const sortedIds = Array.from(linkedIds).sort().reverse();
    
    // Cache the result
    leagueIdsCache[leagueId] = sortedIds;
    
    return sortedIds;
  } catch (error) {
    console.error('Failed to fetch linked league IDs:', error);
    return [leagueId];
  }
}

/**
 * Fetches user leagues for a given season or finds next season's league
 */
export async function getUserLeagues(userId: string, season?: string): Promise<SleeperLeague[]> {
  if (!season) {
    // When no season is provided, fetch next season's leagues
    const league = await getLeagueInfo(userId); // userId is actually leagueId in this case
    const users = await getLeagueUsers(userId);
    const owner = users.find(user => user.is_owner);
    if (!owner) return [];

    const nextSeason = (parseInt(league.season) + 1).toString();
    const response = await fetch(`${BASE_URL}/user/${owner.user_id}/leagues/nfl/${nextSeason}`);
    if (!response.ok) return [];
    return response.json();
  }

  // When season is provided, fetch leagues for that season
  const response = await fetch(`${BASE_URL}/user/${userId}/leagues/nfl/${season}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user leagues: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeagueInfo(leagueId: string) {
  const response = await fetch(`${BASE_URL}/league/${leagueId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch league info: ' + response.statusText);
  }
  return await response.json();
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  const response = await fetch(`${BASE_URL}/league/${leagueId}/users`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league users: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeagueRosters(leagueId: string, season?: string): Promise<any[]> {
  const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}${season ? `/${season}` : ''}/rosters`);
  if (!response.ok) {
    throw new Error('Failed to fetch league rosters');
  }
  return response.json();
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const response = await fetch(`${BASE_URL}/league/${leagueId}/matchups/${week}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league matchups: ${response.statusText}`);
  }
  return response.json();
}

export async function getNFLState(): Promise<SleeperNFLState> {
  const response = await fetch(`${BASE_URL}/state/nfl`);
  if (!response.ok) {
    throw new Error(`Failed to fetch NFL state: ${response.statusText}`);
  }
  return response.json();
}

// New functions for multi-season support

export async function getLeaguePreviousSeason(leagueId: string): Promise<string | null> {
  const league = await getLeagueInfo(leagueId);
  return league.previous_league_id || null;
}

// Helper function to get all seasons for a league
export async function getAllLeagueSeasons(leagueId: string): Promise<string[]> {
  try {
    // Get the current league info
    const league = await getLeagueInfo(leagueId);
    const seasons: string[] = [league.season];

    // Get previous seasons by following the previous_league_id chain
    let currentLeagueId = league.previous_league_id;
    while (currentLeagueId) {
      const previousLeague = await getLeagueInfo(currentLeagueId);
      seasons.push(previousLeague.season);
      currentLeagueId = previousLeague.previous_league_id;
    }

    return seasons.sort((a, b) => Number(b) - Number(a)); // Sort in descending order
  } catch (error) {
    console.error('Failed to fetch league seasons:', error);
    return []; // Return empty array if there's an error
  }
}

// Helper function to get all matchups for a season
export async function getAllSeasonMatchups(leagueId: string, totalWeeks: number) {
  const matchupPromises = Array.from({ length: totalWeeks }, (_, i) =>
    getLeagueMatchups(leagueId, i + 1)
  );
  return Promise.all(matchupPromises);
}

// Helper function to get user display info
export function getUserDisplayInfo(users: SleeperUser[], rosters: SleeperRoster[], rosterId: number) {
  const roster = rosters.find((r) => r.roster_id === rosterId);
  if (!roster) return null;
  
  const user = users.find((u) => u.user_id === roster.owner_id);
  if (!user) return null;

  return {
    teamName: user.metadata.team_name || user.display_name,
    avatar: user.avatar,
    userId: user.user_id,
    wins: roster.settings.wins,
    losses: roster.settings.losses,
    ties: roster.settings.ties,
    fpts: roster.settings.fpts + roster.settings.fpts_decimal / 100,
    fptsAgainst: roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100,
  };
}

// Helper function to aggregate user stats across seasons
export interface AggregatedStats {
  userId: string;
  username: string;
  avatar: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  totalPoints: number;
  totalPointsAgainst: number;
  winPercentage: number;
  averagePointsPerGame: number;
  bestFinish: number;
  championships: number;
  playoffAppearances: number;
  seasons: number;
}

export async function getAggregatedUserStats(leagueId: string): Promise<AggregatedStats[]> {
  const statsMap = new Map<string, AggregatedStats>();
  let currentLeagueId = leagueId;

  try {
    while (currentLeagueId) {
      // Get league info first to check if it exists
      const league = await getLeagueInfo(currentLeagueId);
      const [users, rosters] = await Promise.all([
        getLeagueUsers(currentLeagueId),
        getLeagueRosters(currentLeagueId),
      ]);

      users.forEach(user => {
        const roster = rosters.find(r => r.owner_id === user.user_id);
        if (!roster) return;

        const existingStats = statsMap.get(user.user_id) || {
          userId: user.user_id,
          username: user.display_name,
          avatar: user.avatar,
          totalWins: 0,
          totalLosses: 0,
          totalTies: 0,
          totalPoints: 0,
          totalPointsAgainst: 0,
          winPercentage: 0,
          averagePointsPerGame: 0,
          bestFinish: roster.roster_id,
          championships: 0,
          playoffAppearances: 0,
          seasons: 0,
        };

        // Update stats
        existingStats.totalWins += roster.settings.wins;
        existingStats.totalLosses += roster.settings.losses;
        existingStats.totalTies += roster.settings.ties;
        existingStats.totalPoints += roster.settings.fpts + roster.settings.fpts_decimal / 100;
        existingStats.totalPointsAgainst += roster.settings.fpts_against + roster.settings.fpts_against_decimal / 100;
        existingStats.seasons += 1;
        
        // Update best finish
        if (roster.roster_id < existingStats.bestFinish) {
          existingStats.bestFinish = roster.roster_id;
        }

        // Check for championships (assuming roster_id 1 is champion)
        if (roster.roster_id === 1) {
          existingStats.championships += 1;
        }

        // Check for playoff appearances
        if (roster.roster_id <= league.settings.playoff_teams) {
          existingStats.playoffAppearances += 1;
        }

        // Calculate averages
        const totalGames = existingStats.totalWins + existingStats.totalLosses + existingStats.totalTies;
        existingStats.winPercentage = totalGames > 0 
          ? (existingStats.totalWins + existingStats.totalTies * 0.5) / totalGames * 100 
          : 0;
        existingStats.averagePointsPerGame = totalGames > 0 
          ? existingStats.totalPoints / totalGames 
          : 0;

        statsMap.set(user.user_id, existingStats);
      });

      // Move to previous season
      currentLeagueId = league.previous_league_id || '';
    }

    return Array.from(statsMap.values()).sort((a, b) => b.winPercentage - a.winPercentage);
  } catch (error) {
    console.error('Failed to fetch aggregated stats:', error);
    throw error;
  }
}

interface TeamMetrics {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
  };
  points: {
    total: number;
    average: number;
    high: number;
    low: number;
  };
  consistency: {
    score: number; // 0-100, based on standard deviation of weekly scores
    averageMargin: number;
  };
  explosiveness: {
    score: number; // 0-100, based on frequency of high-scoring weeks
    explosiveGames: number; // games above 120% of league average
  };
  clutch: {
    score: number; // 0-100, based on performance in close games and against top teams
    closeWins: number;
    topWins: number;
  };
}

export async function getTeamMetrics(leagueId: string, season?: string): Promise<TeamMetrics[]> {
  try {
    // For all-time stats, we need to aggregate across all seasons
    if (!season || season === 'all-time') {
      const metricsMap = new Map<string, TeamMetrics>();
      let currentLeagueId = leagueId;

      while (currentLeagueId) {
        const league = await getLeagueInfo(currentLeagueId);
        const [users, rosters, allMatchups] = await Promise.all([
          getLeagueUsers(currentLeagueId),
          getLeagueRosters(currentLeagueId),
          getAllSeasonMatchups(currentLeagueId, 18),
        ]);

        const leagueMetrics = await calculateSeasonMetrics(users, rosters, allMatchups);
        
        // Aggregate metrics for each user
        leagueMetrics.forEach(metric => {
          const existing = metricsMap.get(metric.userId);
          if (!existing) {
            metricsMap.set(metric.userId, metric);
            return;
          }

          // Combine stats
          existing.record.wins += metric.record.wins;
          existing.record.losses += metric.record.losses;
          existing.record.ties += metric.record.ties;
          existing.points.total += metric.points.total;
          existing.points.high = Math.max(existing.points.high, metric.points.high);
          existing.points.low = Math.min(existing.points.low, metric.points.low);
          existing.clutch.closeWins += metric.clutch.closeWins;
          existing.explosiveness.explosiveGames += metric.explosiveness.explosiveGames;
        });

        currentLeagueId = league.previous_league_id || '';
      }

      // Recalculate averages and percentages for aggregated stats
      const metrics = Array.from(metricsMap.values());
      metrics.forEach(metric => {
        const totalGames = metric.record.wins + metric.record.losses + metric.record.ties;
        metric.record.winPct = (metric.record.wins + metric.record.ties * 0.5) / totalGames * 100;
        metric.points.average = metric.points.total / totalGames;
        metric.consistency.score = calculateConsistencyScore(metric.points.average, metric.points.high, metric.points.low);
        metric.explosiveness.score = (metric.explosiveness.explosiveGames / totalGames) * 100;
        metric.clutch.score = (metric.clutch.closeWins / totalGames) * 100;
      });

      return metrics.sort((a, b) => b.record.winPct - a.record.winPct);
    }

    // For specific season, find the correct league ID
    let targetLeagueId = leagueId;
    let currentId = leagueId;
    while (currentId) {
      const league = await getLeagueInfo(currentId);
      if (league.season === season) {
        targetLeagueId = currentId;
        break;
      }
      currentId = league.previous_league_id || '';
    }

    // Get data for specific season
    const [users, rosters, allMatchups] = await Promise.all([
      getLeagueUsers(targetLeagueId),
      getLeagueRosters(targetLeagueId),
      getAllSeasonMatchups(targetLeagueId, 18),
    ]);

    return calculateSeasonMetrics(users, rosters, allMatchups);
  } catch (error) {
    console.error('Failed to calculate team metrics:', error);
    throw error;
  }
}

// Helper function to calculate metrics for a single season
async function calculateSeasonMetrics(
  users: SleeperUser[],
  rosters: SleeperRoster[],
  allMatchups: SleeperMatchup[][]
): Promise<TeamMetrics[]> {
  const allScores = allMatchups.flat().map(m => m.points || 0);
  const leagueAverage = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
  const explosiveThreshold = leagueAverage * 1.2;

  const metrics: TeamMetrics[] = rosters.map(roster => {
    const user = users.find(u => u.user_id === roster.owner_id);
    if (!user) throw new Error(`User not found for roster ${roster.roster_id}`);

    const teamMatchups = allMatchups.flat().filter(m => m.roster_id === roster.roster_id);
    const weeklyScores = teamMatchups.map(m => m.points || 0);
    const mean = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;

    const closeGames = teamMatchups.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && Math.abs((match.points || 0) - (opposingMatch.points || 0)) < 5;
    });

    const closeWins = closeGames.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && (match.points || 0) > (opposingMatch.points || 0);
    }).length;

    const explosiveGames = weeklyScores.filter(score => score > explosiveThreshold).length;
    const consistencyScore = calculateConsistencyScore(mean, Math.max(...weeklyScores), Math.min(...weeklyScores));

    return {
      userId: user.user_id,
      username: user.display_name,
      avatar: user.avatar,
      teamName: user.metadata.team_name || user.display_name,
      record: {
        wins: roster.settings.wins,
        losses: roster.settings.losses,
        ties: roster.settings.ties,
        winPct: (roster.settings.wins + roster.settings.ties * 0.5) / 
               (roster.settings.wins + roster.settings.losses + roster.settings.ties) * 100,
      },
      points: {
        total: roster.settings.fpts + roster.settings.fpts_decimal / 100,
        average: mean,
        high: Math.max(...weeklyScores),
        low: Math.min(...weeklyScores),
      },
      consistency: {
        score: consistencyScore,
        averageMargin: mean - leagueAverage,
      },
      explosiveness: {
        score: (explosiveGames / teamMatchups.length) * 100,
        explosiveGames,
      },
      clutch: {
        score: (closeWins / Math.max(closeGames.length, 1)) * 100,
        closeWins,
        topWins: closeWins,
      },
    };
  });

  return metrics.sort((a, b) => b.record.winPct - a.record.winPct);
}

function calculateConsistencyScore(average: number, high: number, low: number): number {
  const range = high - low;
  const normalizedRange = range / average;
  return Math.max(0, Math.min(100, 100 - (normalizedRange * 50)));
} 