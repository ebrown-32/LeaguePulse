import { calculateWinPercentage } from './utils';
import {
  SleeperLeague,
  SleeperNFLState,
  SleeperRoster,
  SleeperUser,
  SleeperMatchup,
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
    // First, get the current league info
    const currentLeague = await getLeagueInfo(leagueId);
    const currentOwner = (await getLeagueUsers(leagueId)).find(user => user.is_owner);
    if (!currentOwner) {
      return [leagueId];
    }

    // Get all leagues for the owner for next season
    const nextSeason = (parseInt(currentLeague.season) + 1).toString();
    const ownerLeagues = await fetch(`${BASE_URL}/user/${currentOwner.user_id}/leagues/nfl/${nextSeason}`).then(res => res.ok ? res.json() : []);
    
    // Find the league that has this league as its previous_league_id
    const nextLeague = ownerLeagues.find((l: any) => l.previous_league_id === leagueId);
    if (nextLeague) {
      linkedIds.add(nextLeague.league_id);
    }

    // Then, traverse backwards through previous seasons
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
  try {
    const response = await fetch(`${BASE_URL}/league/${leagueId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return null; // League not found
      }
      throw new Error(`Failed to fetch league info: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching league ${leagueId}:`, error);
    throw error;
  }
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
    const currentLeague = await getLeagueInfo(leagueId);
    const seasons: string[] = [currentLeague.season];

    // Get the league owner
    const currentOwner = (await getLeagueUsers(leagueId)).find(user => user.is_owner);
    if (!currentOwner) {
      return seasons;
    }

    // Check for next season's league
    const nextSeason = (parseInt(currentLeague.season) + 1).toString();
    const ownerLeagues = await fetch(`${BASE_URL}/user/${currentOwner.user_id}/leagues/nfl/${nextSeason}`).then(res => res.ok ? res.json() : []);
    const nextLeague = ownerLeagues.find((l: any) => l.previous_league_id === leagueId);
    if (nextLeague) {
      seasons.push(nextLeague.season);
    }

    // Get previous seasons by following the previous_league_id chain
    let currentLeagueId = currentLeague.previous_league_id;
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

export async function getAggregatedUserStats(leagueIds: string[], currentWeek: number) {
  const stats = new Map<string, {
    userId: string;
    username: string;
    avatar: string;
    totalWins: number;
    totalLosses: number;
    totalTies: number;
    totalPoints: number;
    totalGames: number;
    championships: number;
    playoffAppearances: number;
  }>();

  for (const leagueId of leagueIds) {
    try {
      const league = await getLeagueInfo(leagueId);
      if (!league) continue; // Skip if league not found

      const [rosters, users] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId)
      ]);

      // Map roster IDs to user IDs
      const rosterToUser = new Map(rosters.map(roster => [roster.roster_id, roster.owner_id]));
      const userDetails = new Map(users.map(user => [user.user_id, { username: user.display_name, avatar: user.avatar }]));

      // Process each roster's stats
      for (const roster of rosters) {
        const userId = roster.owner_id;
        const user = userDetails.get(userId);
        if (!userId || !user) continue;

        let userStats = stats.get(userId) || {
          userId,
          username: user.username,
          avatar: user.avatar,
          totalWins: 0,
          totalLosses: 0,
          totalTies: 0,
          totalPoints: 0,
          totalGames: 0,
          championships: 0,
          playoffAppearances: 0,
        };

        // Update regular season stats from roster settings
        userStats.totalWins += roster.settings.wins || 0;
        userStats.totalLosses += roster.settings.losses || 0;
        userStats.totalTies += roster.settings.ties || 0;
        userStats.totalPoints += (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100;
        userStats.totalGames += (roster.settings.wins || 0) + (roster.settings.losses || 0) + (roster.settings.ties || 0);

        // Check for playoff appearance
        if (roster.settings.rank <= league.settings.playoff_teams) {
          userStats.playoffAppearances++;
        }

        // Check for championship (rank 1 is champion)
        if (roster.settings.rank === 1) {
          userStats.championships++;
        }

        stats.set(userId, userStats);
      }
    } catch (error) {
      console.error(`Failed to fetch data for league ${leagueId}:`, error);
      // Continue with other leagues if one fails
      continue;
    }
  }

  return Array.from(stats.values()).map(user => ({
    ...user,
    winPercentage: calculateWinPercentage(user.totalWins, user.totalLosses, user.totalTies),
    averagePointsPerGame: user.totalGames > 0 ? user.totalPoints / user.totalGames : 0,
  }));
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