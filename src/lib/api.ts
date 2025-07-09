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
    if (!currentLeague) {
      return [leagueId];
    }

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
    const visited = new Set<string>();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const league = await getLeagueInfo(currentId);
      if (league && league.previous_league_id && !visited.has(league.previous_league_id)) {
        linkedIds.add(league.previous_league_id);
        currentId = league.previous_league_id;
      } else {
        break;
      }
    }

    // Convert to array and sort by season (most recent first)
    const sortedIds = Array.from(linkedIds).sort().reverse();
    
    console.log('Linked league IDs:', sortedIds);
    
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
  console.log(`Fetching ${totalWeeks} weeks for league ${leagueId}`);
  const matchupPromises = Array.from({ length: totalWeeks }, (_, i) =>
    getLeagueMatchups(leagueId, i + 1)
  );
  const results = await Promise.all(matchupPromises);
  console.log(`Fetched ${results.length} weeks, weeks with data: ${results.map((week, i) => week.length > 0 ? i + 1 : null).filter(w => w !== null).join(', ')}`);
  return results;
}

// Helper function to get the correct number of weeks for a league
export async function getLeagueWeeks(leagueId: string): Promise<number> {
  const league = await getLeagueInfo(leagueId);
  if (!league) return 14; // Default fallback
  
  // Get the playoff start week
  const playoffStartWeek = league.settings.playoff_week_start || 14;
  
  // Calculate how many playoff weeks there are based on number of teams
  const playoffTeams = league.settings.playoff_teams || 6;
  
  // Check if this is a 2-week championship league
  // We need to check the actual league settings for 2-week championships
  // For now, let's assume most leagues use 2-week championships regardless of team count
  const isTwoWeekChampionship = true; // Most leagues use 2-week championships
  
  let numPlayoffWeeks;
  if (isTwoWeekChampionship) {
    // For 2-week championships: Round 1 (1 week) + Championship (2 weeks) = 3 weeks
    numPlayoffWeeks = 3;
  } else {
    // For single-week championships: use log2 calculation
    numPlayoffWeeks = Math.ceil(Math.log2(playoffTeams));
  }
  
  // Total weeks = regular season + playoff weeks
  const totalWeeks = playoffStartWeek + numPlayoffWeeks - 1;
  
  console.log(`League ${leagueId} (${league.season}): playoff starts week ${playoffStartWeek}, ${playoffTeams} teams, ${isTwoWeekChampionship ? '2-week' : '1-week'} championship, ${numPlayoffWeeks} playoff weeks, total weeks: ${totalWeeks}`);
  
  return totalWeeks;
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
    seasons: Set<string>;
    weeklyScores: Map<string, number[]>; // Track weekly scores for records
  }>();

  for (const leagueId of leagueIds) {
    try {
      console.log(`Processing league ${leagueId}...`);
      const league = await getLeagueInfo(leagueId);
      if (!league) {
        console.log(`League ${leagueId} not found, skipping...`);
        continue;
      }
      console.log(`Processing season ${league.season} for league ${leagueId}`);

      const [rosters, users] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId)
      ]);

      // Get all matchups for the season to determine actual playoff participation and championships
      const totalWeeks = await getLeagueWeeks(leagueId);
      const allMatchups = await Promise.all(
        Array.from({ length: totalWeeks }, (_, i) => 
          getLeagueMatchups(leagueId, i + 1).catch(error => {
            console.warn(`Failed to fetch week ${i + 1} for league ${leagueId}:`, error);
            return [];
          })
        )
      );

      // Process each roster's stats
      for (const roster of rosters) {
        const userId = roster.owner_id;
        const user = users.find(u => u.user_id === userId);
        if (!userId || !user) continue;

        let userStats = stats.get(userId);
        if (!userStats) {
          userStats = {
          userId,
            username: user.display_name,
          avatar: user.avatar,
          totalWins: 0,
          totalLosses: 0,
          totalTies: 0,
          totalPoints: 0,
          totalGames: 0,
          championships: 0,
          playoffAppearances: 0,
            seasons: new Set(),
            weeklyScores: new Map(),
          };
          stats.set(userId, userStats);
        }

        // Add this season to the user's seasons
        userStats.seasons.add(league.season);

        // Track weekly scores for this season
        const seasonScores: number[] = [];
        userStats.weeklyScores.set(league.season, seasonScores);

        // Process regular season matchups to collect weekly scores (but not calculate wins/losses)
        const regularSeasonWeeks = league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : totalWeeks;
        
        for (let week = 0; week < regularSeasonWeeks && week < allMatchups.length; week++) {
          const weekMatchups = allMatchups[week];
          if (!weekMatchups) continue;

          const userMatchup = weekMatchups.find(m => m.roster_id === roster.roster_id);
          if (userMatchup && typeof userMatchup.points === 'number') {
            seasonScores.push(userMatchup.points);
          }
        }

        // Use roster settings for wins/losses/ties (these already account for median games if enabled)
        userStats.totalWins += (roster.settings.wins || 0);
        userStats.totalLosses += (roster.settings.losses || 0);
        userStats.totalTies += (roster.settings.ties || 0);
        
        // Update total points from roster settings (more reliable than summing matchups)
        userStats.totalPoints += (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100;
        userStats.totalGames += (roster.settings.wins || 0) + (roster.settings.losses || 0) + (roster.settings.ties || 0);

        // Determine playoff participation using league settings and roster rankings
        const playoffTeams = league.settings.playoff_teams || 6;
        const rosterRank = roster.settings.rank || 0;
        
        // A team makes playoffs if they finish in the top N spots (where N = playoff_teams)
        if (rosterRank > 0 && rosterRank <= playoffTeams) {
          userStats.playoffAppearances++;
          console.log(`Playoff appearance detected for ${user.display_name} in season ${league.season} - finished ${rosterRank}/${league.settings.num_teams}`);
        }

        // Determine championship by analyzing playoff bracket structure
        const playoffWeeks = allMatchups.slice(regularSeasonWeeks);
        if (playoffWeeks.length > 0) {
          // Get the final playoff week (championship game)
          const finalWeek = playoffWeeks[playoffWeeks.length - 1];
          
          // Find the user's matchup in the final week
          const userFinalMatchup = finalWeek.find((m: any) => m.roster_id === roster.roster_id && typeof m.points === 'number' && m.points > 0);
          
          if (userFinalMatchup) {
            // Find the opponent in the same matchup
            const opponentMatchup = finalWeek.find((m: any) => 
              m.matchup_id === userFinalMatchup.matchup_id && 
              m.roster_id !== roster.roster_id &&
              typeof m.points === 'number' && 
              m.points > 0
            );
            
            // Check if this user won the championship game
            if (opponentMatchup && userFinalMatchup.points > opponentMatchup.points) {
          userStats.championships++;
              console.log(`Championship detected for ${user.display_name} in season ${league.season} - won championship game ${userFinalMatchup.points} to ${opponentMatchup.points}`);
        }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch data for league ${leagueId}:`, error);
      continue;
    }
  }

  const finalStats = Array.from(stats.values()).map(user => ({
    userId: user.userId,
    username: user.username,
    avatar: user.avatar,
    totalWins: user.totalWins,
    totalLosses: user.totalLosses,
    totalTies: user.totalTies,
    totalPoints: user.totalPoints,
    championships: user.championships,
    playoffAppearances: user.playoffAppearances,
    winPercentage: calculateWinPercentage(user.totalWins, user.totalLosses, user.totalTies),
    // Note: PPG is calculated using total points divided by total games (including median games)
    // This gives the true average points per game, not halved for median games
    averagePointsPerGame: user.totalGames > 0 ? user.totalPoints / user.totalGames : 0,
    seasonsPlayed: user.seasons.size,
    weeklyScores: Object.fromEntries(user.weeklyScores),
  }));

  console.log('Final aggregated stats:', finalStats);
  return finalStats;
}

interface AdvancedTeamMetrics {
  userId: string;
  username: string;
  avatar: string;
  teamName: string;
  record: {
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    gamesPlayed: number;
  };
  points: {
    total: number;
    average: number;
    high: number;
    low: number;
    standardDeviation: number;
    coefficientOfVariation: number;
    weeklyScores: number[];
  };
  consistency: {
    score: number; // 0-100, based on coefficient of variation
    averageMargin: number;
    volatilityIndex: number;
    boomBustRatio: number;
  };
  explosiveness: {
    score: number; // 0-100, based on frequency of high-scoring weeks
    explosiveGames: number; // games above 120% of league average
    explosiveRate: number;
    highestWeekRank: number;
  };
  clutch: {
    score: number; // 0-100, based on performance in close games and against top teams
    closeWins: number;
    closeGames: number;
    closeWinRate: number;
    topWins: number;
    playoffWins: number;
  };
  efficiency: {
    score: number; // 0-100, based on points per win and efficiency metrics
    pointsPerWin: number;
    winEfficiency: number;
    scoringEfficiency: number;
  };
  momentum: {
    score: number; // 0-100, based on late-season performance and streaks
    lateSeasonRecord: string;
    finalWeeksWinRate: number;
    longestWinStreak: number;
    currentStreak: number;
  };
  luck: {
    score: number; // 0-100, based on expected vs actual wins
    expectedWins: number;
    luckRating: number;
    closeLosses: number;
  };
  season: string;
  finalRank: number;
  playoffAppearance: boolean;
  championship: boolean;
}

export async function getAdvancedTeamMetrics(leagueId: string, season?: string): Promise<AdvancedTeamMetrics[]> {
  try {
    // For all-time stats, we need to aggregate across all seasons
    if (!season || season === 'all-time') {
      const metricsMap = new Map<string, AdvancedTeamMetrics>();
      
      // Start with current league and traverse backwards to get all seasons
      let currentLeagueId = leagueId;
      const processedSeasons = new Set<string>();

      while (currentLeagueId) {
        const league = await getLeagueInfo(currentLeagueId);
        if (!league) {
          currentLeagueId = league.previous_league_id || '';
          continue;
        }
        
        // Skip if we've already processed this season
        if (processedSeasons.has(league.season)) {
          currentLeagueId = league.previous_league_id || '';
          continue;
        }
        
        processedSeasons.add(league.season);

        const totalWeeks = await getLeagueWeeks(currentLeagueId);
        console.log(`Fetching ${totalWeeks} weeks for league ${currentLeagueId} (${league.season})`);
        
        const [users, rosters, allMatchups] = await Promise.all([
          getLeagueUsers(currentLeagueId),
          getLeagueRosters(currentLeagueId),
          getAllSeasonMatchups(currentLeagueId, totalWeeks),
        ]);

        // Check if this season has any completed games
        const completedScores = allMatchups.flat().map(m => m.points || 0).filter(score => score > 0);
        if (completedScores.length === 0) {
          console.log(`Skipping season ${league.season} - no completed games`);
          currentLeagueId = league.previous_league_id || '';
          continue;
        }
        
        console.log(`Processing season ${league.season} with ${completedScores.length} completed games`);

        const leagueMetrics = await calculateAdvancedSeasonMetrics(users, rosters, allMatchups, league);
        
        // Aggregate metrics for each user
        leagueMetrics.forEach(metric => {
          const existing = metricsMap.get(metric.userId);
          if (!existing) {
            metricsMap.set(metric.userId, metric);
            return;
          }

          // Combine stats across seasons
          existing.record.wins += metric.record.wins;
          existing.record.losses += metric.record.losses;
          existing.record.ties += metric.record.ties;
          existing.record.gamesPlayed += metric.record.gamesPlayed;
          existing.points.total += metric.points.total;
          existing.points.weeklyScores.push(...metric.points.weeklyScores);
          existing.points.high = Math.max(existing.points.high, metric.points.high);
          existing.points.low = Math.min(existing.points.low, metric.points.low);
          existing.clutch.closeWins += metric.clutch.closeWins;
          existing.clutch.closeGames += metric.clutch.closeGames;
          existing.clutch.topWins += metric.clutch.topWins;
          existing.clutch.playoffWins += metric.clutch.playoffWins;
          existing.explosiveness.explosiveGames += metric.explosiveness.explosiveGames;
          existing.momentum.longestWinStreak = Math.max(existing.momentum.longestWinStreak, metric.momentum.longestWinStreak);
          existing.luck.closeLosses += metric.luck.closeLosses;
          existing.luck.expectedWins += metric.luck.expectedWins;
        });
        
        console.log(`Season ${league.season}: ${leagueMetrics.length} teams processed, weekly scores: ${leagueMetrics.map(m => m.points.weeklyScores.length).join(', ')}`);

        currentLeagueId = league.previous_league_id || '';
      }

      // Recalculate aggregated stats
      const metrics = Array.from(metricsMap.values());
      
      // Calculate overall all-time league average for proper average margin calculation
      const allTimeScores = metrics.flatMap(m => m.points.weeklyScores);
      const allTimeLeagueAverage = allTimeScores.length > 0 ? allTimeScores.reduce((sum, score) => sum + score, 0) / allTimeScores.length : 0;
      
      metrics.forEach(metric => {
        const totalGames = metric.points.weeklyScores.length; // Only count completed games
        const totalWLT = metric.record.wins + metric.record.losses + metric.record.ties;
        metric.record.winPct = totalWLT > 0 ? (metric.record.wins + metric.record.ties * 0.5) / totalWLT * 100 : 0;
        
        // Calculate PPG the same way as season-specific: average of weekly scores
        metric.points.average = totalGames > 0 ? metric.points.weeklyScores.reduce((sum, score) => sum + score, 0) / totalGames : 0;
        
        console.log(`${metric.teamName}: ${totalGames} games, ${metric.points.weeklyScores.length} weekly scores, PPG: ${metric.points.average.toFixed(1)}`);
        
        // Recalculate advanced metrics with aggregated data
        metric.points.standardDeviation = calculateStandardDeviation(metric.points.weeklyScores);
        metric.points.coefficientOfVariation = metric.points.average > 0 ? metric.points.standardDeviation / metric.points.average : 0;
        
        // Calculate average margin against all-time league average
        metric.consistency.averageMargin = metric.points.average - allTimeLeagueAverage;
        metric.consistency.score = calculateConsistencyScore(metric.points.coefficientOfVariation);
        metric.consistency.volatilityIndex = calculateVolatilityIndex(metric.points.weeklyScores);
        metric.consistency.boomBustRatio = calculateBoomBustRatio(metric.points.weeklyScores);
        
        // Recalculate explosive games using all-time league average
        const allTimeExplosiveThreshold = allTimeLeagueAverage * 1.2;
        const allTimeExplosiveGames = metric.points.weeklyScores.filter(score => score > allTimeExplosiveThreshold).length;
        metric.explosiveness.explosiveGames = allTimeExplosiveGames;
        metric.explosiveness.score = totalGames > 0 ? (allTimeExplosiveGames / totalGames) * 100 : 0;
        metric.explosiveness.explosiveRate = totalGames > 0 ? allTimeExplosiveGames / totalGames : 0;
        
        metric.clutch.score = metric.clutch.closeGames > 0 ? (metric.clutch.closeWins / metric.clutch.closeGames) * 100 : 0;
        metric.clutch.closeWinRate = metric.clutch.closeGames > 0 ? metric.clutch.closeWins / metric.clutch.closeGames : 0;
        
        metric.efficiency.score = calculateEfficiencyScore(metric.points.average, metric.record.winPct, totalGames);
        metric.efficiency.pointsPerWin = (metric.record.wins || 0) > 0 ? metric.points.total / (metric.record.wins || 0) : 0;
        metric.efficiency.winEfficiency = totalGames > 0 ? (metric.record.wins || 0) / totalGames : 0;
        metric.efficiency.scoringEfficiency = calculateScoringEfficiency(metric.points.weeklyScores);
        
        metric.momentum.score = calculateMomentumScore(metric.momentum.finalWeeksWinRate, metric.momentum.longestWinStreak);
        
        metric.luck.score = calculateLuckScore(metric.luck.expectedWins, metric.record.wins || 0, metric.luck.closeLosses);
        metric.luck.luckRating = (metric.record.wins || 0) - metric.luck.expectedWins;
      });

      return metrics.sort((a, b) => b.record.winPct - a.record.winPct);
    }

    // For specific season, find the correct league ID
    let targetLeagueId = leagueId;
    let currentId = leagueId;
    while (currentId) {
      const league = await getLeagueInfo(currentId);
      if (league && league.season === season) {
        targetLeagueId = currentId;
        break;
      }
      currentId = league?.previous_league_id || '';
    }

    // Get data for specific season
    const league = await getLeagueInfo(targetLeagueId);
    if (!league) throw new Error('League not found');

    const totalWeeks = await getLeagueWeeks(targetLeagueId);
    console.log(`Fetching ${totalWeeks} weeks for specific season ${league.season}`);
    
    const [users, rosters, allMatchups] = await Promise.all([
      getLeagueUsers(targetLeagueId),
      getLeagueRosters(targetLeagueId),
      getAllSeasonMatchups(targetLeagueId, totalWeeks),
    ]);

    // Check if this season has any completed games
    const completedScores = allMatchups.flat().map(m => m.points || 0).filter(score => score > 0);
    if (completedScores.length === 0) {
      console.log(`Season ${league.season} has no completed games, returning empty metrics`);
      return [];
    }
    
    console.log(`Processing specific season ${league.season} with ${completedScores.length} completed games`);

    return calculateAdvancedSeasonMetrics(users, rosters, allMatchups, league);
  } catch (error) {
    console.error('Failed to calculate advanced team metrics:', error);
    throw error;
  }
}

// Helper function to calculate advanced metrics for a single season
async function calculateAdvancedSeasonMetrics(
  users: SleeperUser[],
  rosters: SleeperRoster[],
  allMatchups: SleeperMatchup[][],
  league: any
): Promise<AdvancedTeamMetrics[]> {
  // Check if median games are enabled
  // Median games add an extra win/loss each week based on scoring vs league median
  // This affects total games played and win/loss records
  const medianGamesEnabled = league.settings.median_wins || false;
  
  // Calculate league-wide statistics
  const allScores = allMatchups.flat().map(m => m.points || 0).filter(score => score > 0);
  const leagueAverage = allScores.length > 0 ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length : 0;
  const explosiveThreshold = leagueAverage * 1.2;
  const closeGameThreshold = 10; // Points difference for "close game"

  // Get playoff teams for clutch calculations
  const playoffTeams = league.settings.playoff_teams || 6;
  const playoffRosterIds = new Set<number>();
  rosters.forEach(roster => {
    const rank = roster.settings.rank || 0;
    if (rank > 0 && rank <= playoffTeams) {
      playoffRosterIds.add(roster.roster_id);
    }
  });

  const metrics: AdvancedTeamMetrics[] = rosters.map(roster => {
    const user = users.find(u => u.user_id === roster.owner_id);
    if (!user) throw new Error(`User not found for roster ${roster.roster_id}`);

    // Get all matchups for this team
    const teamMatchups = allMatchups.flat().filter(m => m.roster_id === roster.roster_id);
    const weeklyScores = teamMatchups.map(m => m.points || 0).filter(score => score > 0);
    const mean = weeklyScores.length > 0 ? weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length : 0;
    
    console.log(`${user.display_name}: ${weeklyScores.length} weekly scores from ${allMatchups.length} weeks, scores: ${weeklyScores.join(', ')}`);

    // Calculate standard deviation and coefficient of variation
    const standardDeviation = calculateStandardDeviation(weeklyScores);
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 0;

    // Calculate close games and clutch performance
    const closeGames = teamMatchups.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && Math.abs((match.points || 0) - (opposingMatch.points || 0)) < closeGameThreshold;
    });

    const closeWins = closeGames.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && (match.points || 0) > (opposingMatch.points || 0);
    }).length;

    // Calculate wins against playoff teams
    const playoffWins = teamMatchups.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && 
             (match.points || 0) > (opposingMatch.points || 0) && 
             playoffRosterIds.has(opposingMatch.roster_id);
    }).length;

    // Calculate explosive games
    const explosiveGames = weeklyScores.filter(score => score > explosiveThreshold).length;

    // Calculate win streaks
    const winStreak = calculateLongestWinStreak(teamMatchups, allMatchups.flat());

    // Calculate late season performance (last 4 weeks)
    const regularSeasonWeeks = league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : 14;
    const lateSeasonWeeks = Math.max(0, regularSeasonWeeks - 4);
    const lateSeasonMatchups = teamMatchups.filter(match => {
      const week = allMatchups.findIndex(weekMatchups => 
        weekMatchups.some(m => m.matchup_id === match.matchup_id)
      );
      return week >= lateSeasonWeeks && week < regularSeasonWeeks;
    });

    const lateSeasonWins = lateSeasonMatchups.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && (match.points || 0) > (opposingMatch.points || 0);
    }).length;

    const lateSeasonWinRate = lateSeasonMatchups.length > 0 ? lateSeasonWins / lateSeasonMatchups.length : 0;

    // Calculate expected wins based on points scored
    const expectedWins = calculateExpectedWins(weeklyScores, allScores);

    // Calculate close losses
    const closeLosses = teamMatchups.filter(match => {
      const opposingMatch = allMatchups.flat().find(m => 
        m.matchup_id === match.matchup_id && m.roster_id !== match.roster_id
      );
      return opposingMatch && 
             (match.points || 0) < (opposingMatch.points || 0) && 
             Math.abs((match.points || 0) - (opposingMatch.points || 0)) < closeGameThreshold;
    }).length;

    const finalRank = roster.settings.rank || 0;
    const playoffAppearance = finalRank > 0 && finalRank <= playoffTeams;

    // Calculate total games played (accounting for median games)
    // Sleeper roster settings already include median game wins/losses if enabled
    // So we don't need to double-count or adjust the calculations
    const totalGames = (roster.settings.wins || 0) + (roster.settings.losses || 0) + (roster.settings.ties || 0);
    const winPercentage = totalGames > 0 ? (roster.settings.wins + (roster.settings.ties || 0) * 0.5) / totalGames * 100 : 0;
    
    // Calculate total points (roster settings already account for median games if enabled)
    // Points per game = total points / total games (including median games)
    const totalPoints = (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100;

    return {
      userId: user.user_id,
      username: user.display_name,
      avatar: user.avatar,
      teamName: user.metadata.team_name || user.display_name,
      record: {
        wins: roster.settings.wins || 0,
        losses: roster.settings.losses || 0,
        ties: roster.settings.ties || 0,
        winPct: winPercentage,
        gamesPlayed: totalGames,
      },
      points: {
        total: totalPoints,
        average: mean,
        high: weeklyScores.length > 0 ? Math.max(...weeklyScores) : 0,
        low: weeklyScores.length > 0 ? Math.min(...weeklyScores) : 0,
        standardDeviation,
        coefficientOfVariation,
        weeklyScores,
      },
      consistency: {
        score: calculateConsistencyScore(coefficientOfVariation),
        averageMargin: mean - leagueAverage,
        volatilityIndex: calculateVolatilityIndex(weeklyScores),
        boomBustRatio: calculateBoomBustRatio(weeklyScores),
      },
      explosiveness: {
        score: weeklyScores.length > 0 ? (explosiveGames / weeklyScores.length) * 100 : 0,
        explosiveGames,
        explosiveRate: weeklyScores.length > 0 ? explosiveGames / weeklyScores.length : 0,
        highestWeekRank: calculateHighestWeekRank(teamMatchups, allMatchups),
      },
      clutch: {
        score: closeGames.length > 0 ? (closeWins / closeGames.length) * 100 : 0,
        closeWins,
        closeGames: closeGames.length,
        closeWinRate: closeGames.length > 0 ? closeWins / closeGames.length : 0,
        topWins: playoffWins,
        playoffWins: playoffWins,
      },
      efficiency: {
        score: calculateEfficiencyScore(mean, winPercentage, totalGames),
        pointsPerWin: (roster.settings.wins || 0) > 0 ? totalPoints / (roster.settings.wins || 0) : 0,
        winEfficiency: totalGames > 0 ? (roster.settings.wins || 0) / totalGames : 0,
        scoringEfficiency: calculateScoringEfficiency(weeklyScores),
      },
      momentum: {
        score: calculateMomentumScore(lateSeasonWinRate, winStreak),
        lateSeasonRecord: `${lateSeasonWins}-${lateSeasonMatchups.length - lateSeasonWins}`,
        finalWeeksWinRate: lateSeasonWinRate,
        longestWinStreak: winStreak,
        currentStreak: calculateCurrentStreak(teamMatchups, allMatchups.flat()),
      },
      luck: {
        score: calculateLuckScore(expectedWins, roster.settings.wins || 0, closeLosses),
        expectedWins,
        luckRating: (roster.settings.wins || 0) - expectedWins,
        closeLosses,
      },
      season: league.season,
      finalRank,
      playoffAppearance,
      championship: false, // Will be calculated separately if needed
    };
  });

  return metrics.sort((a, b) => b.record.winPct - a.record.winPct);
}

// Helper functions for advanced calculations
function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateConsistencyScore(coefficientOfVariation: number): number {
  // Lower coefficient of variation = higher consistency
  return Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 100)));
}

function calculateVolatilityIndex(weeklyScores: number[]): number {
  if (weeklyScores.length < 2) return 0;
  const sortedScores = [...weeklyScores].sort((a, b) => a - b);
  const q1 = sortedScores[Math.floor(sortedScores.length * 0.25)];
  const q3 = sortedScores[Math.floor(sortedScores.length * 0.75)];
  return q3 - q1;
}

function calculateBoomBustRatio(weeklyScores: number[]): number {
  if (weeklyScores.length === 0) return 0;
  const mean = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;
  const boomGames = weeklyScores.filter(score => score > mean * 1.2).length;
  const bustGames = weeklyScores.filter(score => score < mean * 0.8).length;
  return bustGames > 0 ? boomGames / bustGames : boomGames;
}

function calculateEfficiencyScore(averagePoints: number, winPercentage: number, gamesPlayed: number): number {
  if (gamesPlayed === 0) return 0;
  const pointsEfficiency = Math.min(100, (averagePoints / 150) * 100); // Assuming 150 is a good benchmark
  const winEfficiency = winPercentage;
  return (pointsEfficiency + winEfficiency) / 2;
}

function calculateScoringEfficiency(weeklyScores: number[]): number {
  if (weeklyScores.length === 0) return 0;
  const mean = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;
  const variance = weeklyScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / weeklyScores.length;
  return mean / Math.sqrt(variance + 1); // Add 1 to avoid division by zero
}

function calculateMomentumScore(lateSeasonWinRate: number, longestWinStreak: number): number {
  const winRateScore = lateSeasonWinRate * 100;
  const streakScore = Math.min(100, longestWinStreak * 20); // 5+ game streak = 100
  return (winRateScore + streakScore) / 2;
}

function calculateExpectedWins(teamScores: number[], allScores: number[]): number {
  if (teamScores.length === 0 || allScores.length === 0) return 0;
  
  let expectedWins = 0;
  teamScores.forEach(teamScore => {
    const winsAgainstLeague = allScores.filter(leagueScore => teamScore > leagueScore).length;
    expectedWins += winsAgainstLeague / allScores.length;
  });
  
  return expectedWins;
}

function calculateLuckScore(expectedWins: number, actualWins: number, closeLosses: number): number {
  const winLuck = Math.max(0, Math.min(100, 50 + (actualWins - expectedWins) * 20));
  const closeLossPenalty = Math.max(0, closeLosses * 10);
  return Math.max(0, winLuck - closeLossPenalty);
}

function calculateLongestWinStreak(teamMatchups: any[], allMatchups: any[]): number {
  let currentStreak = 0;
  let longestStreak = 0;
  
  teamMatchups.forEach(matchup => {
    const opposingMatch = allMatchups.find(m => 
      m.matchup_id === matchup.matchup_id && m.roster_id !== matchup.roster_id
    );
    
    if (opposingMatch && (matchup.points || 0) > (opposingMatch.points || 0)) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });
  
  return longestStreak;
}

function calculateCurrentStreak(teamMatchups: any[], allMatchups: any[]): number {
  let currentStreak = 0;
  let isWinStreak = true;
  
  // Start from the most recent matchup
  for (let i = teamMatchups.length - 1; i >= 0; i--) {
    const matchup = teamMatchups[i];
    const opposingMatch = allMatchups.find(m => 
      m.matchup_id === matchup.matchup_id && m.roster_id !== matchup.roster_id
    );
    
    if (!opposingMatch) continue;
    
    const isWin = (matchup.points || 0) > (opposingMatch.points || 0);
    
    if (currentStreak === 0) {
      currentStreak = 1;
      isWinStreak = isWin;
    } else if (isWin === isWinStreak) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  return isWinStreak ? currentStreak : -currentStreak;
}

function calculateHighestWeekRank(teamMatchups: any[], allMatchups: any[]): number {
  let highestRank = Infinity;
  
  teamMatchups.forEach(matchup => {
    const weekScores = allMatchups
      .filter(m => m.matchup_id === matchup.matchup_id)
      .map(m => m.points || 0)
      .sort((a, b) => b - a);
    
    const teamScore = matchup.points || 0;
    const rank = weekScores.indexOf(teamScore) + 1;
    highestRank = Math.min(highestRank, rank);
  });
  
  return highestRank === Infinity ? 0 : highestRank;
}

interface HistoricalRecord {
  type: 'championship' | 'playoff' | 'highScore' | 'lowScore' | 'winStreak' | 'lossStreak' | 'blowout' | 'closeGame' | 'consistency' | 'explosiveness';
  season: string;
  week?: number;
  userId: string;
  username: string;
  avatar: string;
  value: number;
  description: string;
  details?: any;
}

export async function generateComprehensiveHistoricalRecords(leagueIds: string[]): Promise<HistoricalRecord[]> {
  const records: HistoricalRecord[] = [];
  const processedChampionships = new Set<string>();

  for (const leagueId of leagueIds) {
    try {
      const league = await getLeagueInfo(leagueId);
      if (!league) continue;

      const [rosters, users] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId)
      ]);

      // Get all matchups for the season
      const totalWeeks = await getLeagueWeeks(leagueId);
      const allMatchups = await Promise.all(
        Array.from({ length: totalWeeks }, (_, i) => 
          getLeagueMatchups(leagueId, i + 1).catch(() => [])
        )
      );

      // Track weekly scores for each user
      const userWeeklyScores = new Map<string, number[]>();
      const userMatchupResults = new Map<string, { wins: number; losses: number; ties: number }>();

      // Initialize tracking
      users.forEach(user => {
        userWeeklyScores.set(user.user_id, []);
        userMatchupResults.set(user.user_id, { wins: 0, losses: 0, ties: 0 });
      });

      // Process regular season matchups
      const regularSeasonWeeks = league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : totalWeeks;
      
      for (let weekIndex = 0; weekIndex < regularSeasonWeeks && weekIndex < allMatchups.length; weekIndex++) {
        const weekMatchups = allMatchups[weekIndex];
        if (!weekMatchups) continue;

        // Group matchups by matchup_id to find head-to-head games
        const matchupGroups = new Map<number, any[]>();
        weekMatchups.forEach(matchup => {
          if (!matchupGroups.has(matchup.matchup_id)) {
            matchupGroups.set(matchup.matchup_id, []);
          }
          matchupGroups.get(matchup.matchup_id)!.push(matchup);
        });

        // Process each matchup
        matchupGroups.forEach(group => {
          if (group.length === 2) {
                         const [team1, team2] = group;
             const roster1 = rosters.find(r => r.roster_id === team1.roster_id);
             const roster2 = rosters.find(r => r.roster_id === team2.roster_id);
             const user1 = roster1 ? users.find(u => u.user_id === roster1.owner_id) : null;
             const user2 = roster2 ? users.find(u => u.user_id === roster2.owner_id) : null;
            
            if (user1 && user2 && typeof team1.points === 'number' && typeof team2.points === 'number') {
              // Track scores
              userWeeklyScores.get(user1.user_id)!.push(team1.points);
              userWeeklyScores.get(user2.user_id)!.push(team2.points);

              // Track results
              const user1Results = userMatchupResults.get(user1.user_id)!;
              const user2Results = userMatchupResults.get(user2.user_id)!;

              if (team1.points > team2.points) {
                user1Results.wins++;
                user2Results.losses++;
              } else if (team1.points < team2.points) {
                user1Results.losses++;
                user2Results.wins++;
              } else {
                user1Results.ties++;
                user2Results.ties++;
              }

              // Record blowout and close game
              const margin = Math.abs(team1.points - team2.points);
              records.push({
                type: margin > 50 ? 'blowout' : 'closeGame',
                season: league.season,
                week: weekIndex + 1,
                userId: team1.points > team2.points ? user1.user_id : user2.user_id,
                username: team1.points > team2.points ? user1.display_name : user2.display_name,
                avatar: team1.points > team2.points ? user1.avatar : user2.avatar,
                value: margin,
                description: `${team1.points > team2.points ? user1.display_name : user2.display_name} won by ${margin.toFixed(2)} points in Week ${weekIndex + 1}`,
                details: {
                  winner: team1.points > team2.points ? user1.display_name : user2.display_name,
                  loser: team1.points > team2.points ? user2.display_name : user1.display_name,
                  winnerScore: Math.max(team1.points, team2.points),
                  loserScore: Math.min(team1.points, team2.points),
                }
              });
            }
          }
        });
      }

      // Generate high/low score records
      userWeeklyScores.forEach((scores, userId) => {
        if (scores.length === 0) return;
        
        const user = users.find(u => u.user_id === userId);
        if (!user) return;

        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const maxScoreWeek = scores.indexOf(maxScore) + 1;
        const minScoreWeek = scores.indexOf(minScore) + 1;

        records.push({
          type: 'highScore',
          season: league.season,
          week: maxScoreWeek,
          userId: user.user_id,
          username: user.display_name,
          avatar: user.avatar,
          value: maxScore,
          description: `${user.display_name} scored ${maxScore.toFixed(2)} points in Week ${maxScoreWeek}`,
        });

        records.push({
          type: 'lowScore',
          season: league.season,
          week: minScoreWeek,
          userId: user.user_id,
          username: user.display_name,
          avatar: user.avatar,
          value: minScore,
          description: `${user.display_name} scored ${minScore.toFixed(2)} points in Week ${minScoreWeek}`,
        });
      });

             // Generate championship records
       const playoffWeeks = allMatchups.slice(regularSeasonWeeks);
       if (playoffWeeks.length > 0) {
         // Get the final playoff week (championship game)
         const finalWeek = playoffWeeks[playoffWeeks.length - 1];
         
         // Find all championship matchups (teams that played in the final week)
         const championshipMatchups = finalWeek.filter(m => typeof m.points === 'number' && m.points > 0);
         
         if (championshipMatchups.length >= 2) {
           // Group matchups by matchup_id to find the championship game
           const matchupGroups = new Map<number, any[]>();
           championshipMatchups.forEach(matchup => {
             if (!matchupGroups.has(matchup.matchup_id)) {
               matchupGroups.set(matchup.matchup_id, []);
             }
             matchupGroups.get(matchup.matchup_id)!.push(matchup);
           });
           
           // Find the championship game (should be the matchup with 2 teams)
           const championshipGame = Array.from(matchupGroups.values()).find(group => group.length === 2);
           
           if (championshipGame) {
             const [team1, team2] = championshipGame;
             const winner = team1.points > team2.points ? team1 : team2;
             const loser = team1.points > team2.points ? team2 : team1;
             
             const championRoster = rosters.find(r => r.roster_id === winner.roster_id);
             const championUser = championRoster ? users.find(u => u.user_id === championRoster.owner_id) : null;
             
             if (championUser) {
               const championshipKey = `${league.season}-${championUser.user_id}`;
               if (!processedChampionships.has(championshipKey)) {
                 processedChampionships.add(championshipKey);
                 records.push({
                   type: 'championship',
                   season: league.season,
                   userId: championUser.user_id,
                   username: championUser.display_name,
                   avatar: championUser.avatar,
                   value: 1,
                   description: `${championUser.display_name} won the ${league.season} championship`,
                   details: {
                     championshipScore: winner.points,
                     opponentScore: loser.points,
                     playoffWeeks: playoffWeeks.length,
                     season: league.season,
                   }
                 });
               }
             }
           }
         }
       }

      // Generate playoff appearance records
      const playoffRosterIds = new Set<number>();
      playoffWeeks.forEach(week => {
        week.forEach(matchup => {
          if (matchup.roster_id) {
            playoffRosterIds.add(matchup.roster_id);
          }
        });
      });

      rosters.forEach(roster => {
        if (playoffRosterIds.has(roster.roster_id)) {
          const user = users.find(u => u.user_id === roster.owner_id);
          if (user) {
            records.push({
              type: 'playoff',
              season: league.season,
              userId: user.user_id,
              username: user.display_name,
              avatar: user.avatar,
              value: 1,
              description: `${user.display_name} made the playoffs in ${league.season}`,
              details: {
                rank: roster.settings.rank,
                record: `${roster.settings.wins || 0}-${roster.settings.losses || 0}${(roster.settings.ties || 0) > 0 ? `-${roster.settings.ties}` : ''}`,
              }
            });
          }
        }
      });

    } catch (error) {
      console.error(`Failed to generate records for league ${leagueId}:`, error);
      continue;
    }
  }

  return records.sort((a, b) => b.value - a.value);
} 

interface LeagueStoryData {
  timeline: Array<{
    year: string;
    type: 'founding' | 'championship' | 'milestone' | 'record' | 'playoff';
    title: string;
    description: string;
    icon: string;
    color: string;
    user?: {
      userId: string;
      username: string;
      avatar: string;
    };
    details?: any;
  }>;
  champions: Array<{
    season: string;
    userId: string;
    username: string;
    avatar: string;
    record: string;
    points: number;
    championshipScore: number;
  }>;
  records: Array<{
    category: string;
    title: string;
    description: string;
    userId: string;
    username: string;
    avatar: string;
    value: number;
    season: string;
    week?: number;
  }>;
  leagueStats: {
    totalSeasons: number;
    totalGames: number;
    totalPoints: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    closestGame: number;
    biggestBlowout: number;
    mostChampionships: number;
    mostPlayoffAppearances: number;
  };
}

export async function generateLeagueStory(leagueIds: string[]): Promise<LeagueStoryData> {
  const timeline: LeagueStoryData['timeline'] = [];
  const champions: LeagueStoryData['champions'] = [];
  const records: LeagueStoryData['records'] = [];
  const leagueStats = {
    totalSeasons: 0,
    totalGames: 0,
    totalPoints: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: Infinity,
    closestGame: Infinity,
    biggestBlowout: 0,
    mostChampionships: 0,
    mostPlayoffAppearances: 0,
  };

  const userStats = new Map<string, {
    championships: number;
    playoffAppearances: number;
    totalPoints: number;
    totalGames: number;
    highestScore: number;
    lowestScore: number;
  }>();

  // Sort league IDs by season (oldest first)
  const sortedLeagueIds = [...leagueIds].sort();

  for (const leagueId of sortedLeagueIds) {
    try {
      const league = await getLeagueInfo(leagueId);
      if (!league) continue;

      const [rosters, users] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId)
      ]);

      // Get all matchups for the season
      const totalWeeks = league.settings.playoff_week_start || 14;
      const allMatchups = await Promise.all(
        Array.from({ length: totalWeeks }, (_, i) => 
          getLeagueMatchups(leagueId, i + 1).catch(() => [])
        )
      );

      // League founding milestone
      if (timeline.length === 0) {
        timeline.push({
          year: league.season,
          type: 'founding',
          title: 'League Founded',
          description: `${league.name} was established with ${league.total_rosters} teams`,
          icon: '🏈',
          color: 'blue',
        });
      }

      // Process regular season matchups
      const regularSeasonWeeks = league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : totalWeeks;
      let seasonHighestScore = 0;
      let seasonLowestScore = Infinity;
      let seasonClosestGame = Infinity;
      let seasonBiggestBlowout = 0;

      for (let weekIndex = 0; weekIndex < regularSeasonWeeks && weekIndex < allMatchups.length; weekIndex++) {
        const weekMatchups = allMatchups[weekIndex];
        if (!weekMatchups) continue;

        // Group matchups by matchup_id
        const matchupGroups = new Map<number, any[]>();
        weekMatchups.forEach(matchup => {
          if (!matchupGroups.has(matchup.matchup_id)) {
            matchupGroups.set(matchup.matchup_id, []);
          }
          matchupGroups.get(matchup.matchup_id)!.push(matchup);
        });

        // Process each matchup
        matchupGroups.forEach(group => {
          if (group.length === 2) {
            const [team1, team2] = group;
            if (typeof team1.points === 'number' && typeof team2.points === 'number') {
              // Track season records
              seasonHighestScore = Math.max(seasonHighestScore, team1.points, team2.points);
              seasonLowestScore = Math.min(seasonLowestScore, team1.points, team2.points);
              
              const margin = Math.abs(team1.points - team2.points);
              seasonClosestGame = Math.min(seasonClosestGame, margin);
              seasonBiggestBlowout = Math.max(seasonBiggestBlowout, margin);

              // Track all-time records
              leagueStats.highestScore = Math.max(leagueStats.highestScore, team1.points, team2.points);
              leagueStats.lowestScore = Math.min(leagueStats.lowestScore, team1.points, team2.points);
              leagueStats.closestGame = Math.min(leagueStats.closestGame, margin);
              leagueStats.biggestBlowout = Math.max(leagueStats.biggestBlowout, margin);
            }
          }
        });
      }

      // Find champion
      const playoffWeeks = allMatchups.slice(regularSeasonWeeks);
      if (playoffWeeks.length > 0) {
        // Get the final playoff week (championship game)
        const finalWeek = playoffWeeks[playoffWeeks.length - 1];
        
        // Find all championship matchups (teams that played in the final week)
        const championshipMatchups = finalWeek.filter(m => typeof m.points === 'number' && m.points > 0);
        
        if (championshipMatchups.length >= 2) {
          // Group matchups by matchup_id to find the championship game
          const matchupGroups = new Map<number, any[]>();
          championshipMatchups.forEach(matchup => {
            if (!matchupGroups.has(matchup.matchup_id)) {
              matchupGroups.set(matchup.matchup_id, []);
            }
            matchupGroups.get(matchup.matchup_id)!.push(matchup);
          });
          
          // Find the championship game (should be the matchup with 2 teams)
          const championshipGame = Array.from(matchupGroups.values()).find(group => group.length === 2);
          
          if (championshipGame) {
            const [team1, team2] = championshipGame;
            const winner = team1.points > team2.points ? team1 : team2;
            const loser = team1.points > team2.points ? team2 : team1;
            
            const championRoster = rosters.find(r => r.roster_id === winner.roster_id);
            const championUser = championRoster ? users.find(u => u.user_id === championRoster.owner_id) : null;
            
            if (championUser) {
              champions.push({
                season: league.season,
                userId: championUser.user_id,
                username: championUser.display_name,
                avatar: championUser.avatar,
                record: `${championRoster.settings.wins || 0}-${championRoster.settings.losses || 0}${(championRoster.settings.ties || 0) > 0 ? `-${championRoster.settings.ties}` : ''}`,
                points: (championRoster.settings.fpts || 0) + (championRoster.settings.fpts_decimal || 0) / 100,
                championshipScore: winner.points,
              });

              timeline.push({
                year: league.season,
                type: 'championship',
                title: `${league.season} Champion`,
                description: `${championUser.display_name} won their championship`,
                icon: '🏆',
                color: 'yellow',
                user: {
                  userId: championUser.user_id,
                  username: championUser.display_name,
                  avatar: championUser.avatar,
                },
                details: {
                  championshipScore: winner.points,
                  opponentScore: loser.points,
                  playoffWeeks: playoffWeeks.length,
                  record: `${championRoster.settings.wins || 0}-${championRoster.settings.losses || 0}${(championRoster.settings.ties || 0) > 0 ? `-${championRoster.settings.ties}` : ''}`,
                }
              });

              // Track user stats
              const userStat = userStats.get(championUser.user_id) || {
                championships: 0,
                playoffAppearances: 0,
                totalPoints: 0,
                totalGames: 0,
                highestScore: 0,
                lowestScore: Infinity,
              };
              userStat.championships++;
              userStats.set(championUser.user_id, userStat);
            }
          }
        }
      }

      // Track playoff appearances
      const playoffRosterIds = new Set<number>();
      playoffWeeks.forEach(week => {
        week.forEach(matchup => {
          if (matchup.roster_id) {
            playoffRosterIds.add(matchup.roster_id);
          }
        });
      });

      rosters.forEach(roster => {
        if (playoffRosterIds.has(roster.roster_id)) {
          const user = users.find(u => u.user_id === roster.owner_id);
          if (user) {
            const userStat = userStats.get(user.user_id) || {
              championships: 0,
              playoffAppearances: 0,
              totalPoints: 0,
              totalGames: 0,
              highestScore: 0,
              lowestScore: Infinity,
            };
            userStat.playoffAppearances++;
            userStats.set(user.user_id, userStat);
          }
        }
      });

      // Add season records to timeline
      if (seasonHighestScore > 0) {
        const highScoreUser = users.find(u => {
          const roster = rosters.find(r => r.roster_id === seasonHighestScore);
          return roster && roster.owner_id === u.user_id;
        });
        
        if (highScoreUser) {
          records.push({
            category: 'High Score',
            title: 'Season High Score',
            description: `${highScoreUser.display_name} scored ${seasonHighestScore.toFixed(2)} points`,
            userId: highScoreUser.user_id,
            username: highScoreUser.display_name,
            avatar: highScoreUser.avatar,
            value: seasonHighestScore,
            season: league.season,
          });
        }
      }

      // Update league stats
      leagueStats.totalSeasons++;
      rosters.forEach(roster => {
        leagueStats.totalGames += (roster.settings.wins || 0) + (roster.settings.losses || 0) + (roster.settings.ties || 0);
        leagueStats.totalPoints += (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100;
      });

    } catch (error) {
      console.error(`Failed to generate story for league ${leagueId}:`, error);
      continue;
    }
  }

  // Add milestone seasons
  const milestoneSeasons = [5, 10, 15, 20];
  milestoneSeasons.forEach(milestone => {
    if (leagueStats.totalSeasons >= milestone) {
      timeline.push({
        year: (parseInt(sortedLeagueIds[0]) + milestone - 1).toString(),
        type: 'milestone',
        title: `${milestone}th Season`,
        description: `The league celebrated ${milestone} seasons of fantasy football`,
        icon: '⭐',
        color: 'purple',
      });
    }
  });

  // Calculate final stats
  leagueStats.averageScore = leagueStats.totalGames > 0 ? leagueStats.totalPoints / leagueStats.totalGames : 0;
  leagueStats.lowestScore = leagueStats.lowestScore === Infinity ? 0 : leagueStats.lowestScore;
  leagueStats.closestGame = leagueStats.closestGame === Infinity ? 0 : leagueStats.closestGame;

  // Find most championships and playoff appearances
  userStats.forEach(stat => {
    leagueStats.mostChampionships = Math.max(leagueStats.mostChampionships, stat.championships);
    leagueStats.mostPlayoffAppearances = Math.max(leagueStats.mostPlayoffAppearances, stat.playoffAppearances);
  });

  return {
    timeline: timeline.sort((a, b) => parseInt(a.year) - parseInt(b.year)),
    champions,
    records: records.sort((a, b) => b.value - a.value),
    leagueStats,
  };
} 

interface LeagueRecord {
  type: 'championship' | 'playoff' | 'highScore' | 'lowScore' | 'winStreak' | 'lossStreak' | 'blowout' | 'closeGame' | 'consistency' | 'explosiveness' | 'seasonHigh' | 'seasonLow' | 'playoffAppearance' | 'regularSeasonChamp';
  season: string;
  week?: number;
  userId: string;
  username: string;
  avatar: string;
  value: number;
  description: string;
  details?: any;
  isAllTime?: boolean;
}

interface SeasonAnalysis {
  season: string;
  leagueId: string;
  league: any;
  users: any[];
  rosters: any[];
  matchups: any[][];
  champions: any[];
  playoffTeams: any[];
  regularSeasonChamp: any;
  seasonStats: {
    totalGames: number;
    totalPoints: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    mostWins: number;
    mostPoints: number;
    closestGame: number;
    biggestBlowout: number;
    highestWeeklyScore: number;
    lowestWeeklyScore: number;
  };
  weeklyStats: {
    [week: number]: {
      highestScore: number;
      lowestScore: number;
      averageScore: number;
      closestGame: number;
      biggestBlowout: number;
    };
  };
  userSeasonStats: {
    [userId: string]: {
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      weeklyScores: number[];
      winStreak: number;
      lossStreak: number;
      highestScore: number;
      lowestScore: number;
      averageScore: number;
      playoffAppearance: boolean;
      championship: boolean;
      finalRank: number;
    };
  };
}

export async function generateComprehensiveLeagueHistory(leagueIds: string[]): Promise<{
  records: LeagueRecord[];
  seasonAnalyses: SeasonAnalysis[];
  allTimeStats: {
    totalSeasons: number;
    totalGames: number;
    totalPoints: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    closestGame: number;
    biggestBlowout: number;
    mostChampionships: number;
    mostPlayoffAppearances: number;
    longestWinStreak: number;
    longestLossStreak: number;
  };
  userAllTimeStats: {
    [userId: string]: {
      username: string;
      avatar: string;
      totalWins: number;
      totalLosses: number;
      totalTies: number;
      totalPoints: number;
      championships: number;
      playoffAppearances: number;
      winPercentage: number;
      averagePointsPerGame: number;
      seasonsPlayed: number;
      highestScore: number;
      lowestScore: number;
      longestWinStreak: number;
      longestLossStreak: number;
      bestFinish: number;
      worstFinish: number;
    };
  };
}> {
  const records: LeagueRecord[] = [];
  const seasonAnalyses: SeasonAnalysis[] = [];
  const userAllTimeStats: { [userId: string]: any } = {};
  const processedChampionships = new Set<string>();

  // Sort league IDs by season (oldest first) and filter out current season if no games played
  const sortedLeagueIds = [...leagueIds].sort();
  const currentLeagueId = sortedLeagueIds[sortedLeagueIds.length - 1];
  
  // Check if current season has any games played
  let currentSeasonHasGames = false;
  if (currentLeagueId) {
    try {
      const currentLeague = await getLeagueInfo(currentLeagueId);
      if (currentLeague) {
        const currentWeekMatchups = await getLeagueMatchups(currentLeagueId, 1);
        currentSeasonHasGames = currentWeekMatchups.some(matchup => 
          typeof matchup.points === 'number' && matchup.points > 0
        );
      }
    } catch (error) {
      console.warn('Could not check current season games:', error);
    }
  }
  
  // Filter out current season if no games have been played
  const leaguesToProcess = currentSeasonHasGames 
    ? sortedLeagueIds 
    : sortedLeagueIds.slice(0, -1);

  for (const leagueId of leaguesToProcess) {
    try {
      const league = await getLeagueInfo(leagueId);
      if (!league) continue;

      const [rosters, users] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId)
      ]);

      // Get all matchups for the season
      const totalWeeks = await getLeagueWeeks(leagueId);
      const allMatchups = await Promise.all(
        Array.from({ length: totalWeeks }, (_, i) => 
          getLeagueMatchups(leagueId, i + 1).catch(() => [])
        )
      );

      // Check if this season has any games played
      const hasGamesPlayed = allMatchups.some(week => 
        week.some(matchup => typeof matchup.points === 'number' && matchup.points > 0)
      );

      if (!hasGamesPlayed) {
        console.log(`Skipping season ${league.season} - no games played yet`);
        continue;
      }

      // Initialize season analysis
      const seasonAnalysis: SeasonAnalysis = {
        season: league.season,
        leagueId,
        league,
        users,
        rosters,
        matchups: allMatchups,
        champions: [],
        playoffTeams: [],
        regularSeasonChamp: null,
        seasonStats: {
          totalGames: 0,
          totalPoints: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: Infinity,
          mostWins: 0,
          mostPoints: 0,
          closestGame: Infinity,
          biggestBlowout: 0,
          highestWeeklyScore: 0,
          lowestWeeklyScore: Infinity,
        },
        weeklyStats: {},
        userSeasonStats: {},
      };

      // Initialize user season stats
      users.forEach(user => {
        seasonAnalysis.userSeasonStats[user.user_id] = {
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          weeklyScores: [],
          winStreak: 0,
          lossStreak: 0,
          highestScore: 0,
          lowestScore: Infinity,
          averageScore: 0,
          playoffAppearance: false,
          championship: false,
          finalRank: 0,
        };
      });

      // Process regular season matchups
      const regularSeasonWeeks = league.settings.playoff_week_start ? league.settings.playoff_week_start - 1 : totalWeeks;
      
      for (let weekIndex = 0; weekIndex < regularSeasonWeeks && weekIndex < allMatchups.length; weekIndex++) {
        const weekMatchups = allMatchups[weekIndex];
        if (!weekMatchups) continue;

        const weekNumber = weekIndex + 1;
        const weekStats = {
          highestScore: 0,
          lowestScore: Infinity,
          averageScore: 0,
          closestGame: Infinity,
          biggestBlowout: 0,
        };

        // Group matchups by matchup_id
        const matchupGroups = new Map<number, any[]>();
        weekMatchups.forEach(matchup => {
          if (!matchupGroups.has(matchup.matchup_id)) {
            matchupGroups.set(matchup.matchup_id, []);
          }
          matchupGroups.get(matchup.matchup_id)!.push(matchup);
        });

        // Process each matchup
        matchupGroups.forEach(group => {
          if (group.length === 2) {
            const [team1, team2] = group;
            if (typeof team1.points === 'number' && typeof team2.points === 'number') {
              const user1 = users.find(u => {
                const roster = rosters.find(r => r.roster_id === team1.roster_id);
                return roster && roster.owner_id === u.user_id;
              });
              const user2 = users.find(u => {
                const roster = rosters.find(r => r.roster_id === team2.roster_id);
                return roster && roster.owner_id === u.user_id;
              });

              if (user1 && user2) {
                // Update user stats
                const user1Stats = seasonAnalysis.userSeasonStats[user1.user_id];
                const user2Stats = seasonAnalysis.userSeasonStats[user2.user_id];

                user1Stats.weeklyScores.push(team1.points);
                user2Stats.weeklyScores.push(team2.points);
                user1Stats.pointsFor += team1.points;
                user2Stats.pointsFor += team2.points;
                user1Stats.pointsAgainst += team2.points;
                user2Stats.pointsAgainst += team1.points;

                // Note: Win/loss records are now calculated from roster settings to account for median games
                // This matchup processing is only for weekly scores and game statistics

                // Update weekly stats
                weekStats.highestScore = Math.max(weekStats.highestScore, team1.points, team2.points);
                weekStats.lowestScore = Math.min(weekStats.lowestScore, team1.points, team2.points);
                
                const margin = Math.abs(team1.points - team2.points);
                weekStats.closestGame = Math.min(weekStats.closestGame, margin);
                weekStats.biggestBlowout = Math.max(weekStats.biggestBlowout, margin);

                // Update season stats
                seasonAnalysis.seasonStats.highestScore = Math.max(seasonAnalysis.seasonStats.highestScore, team1.points, team2.points);
                seasonAnalysis.seasonStats.lowestScore = Math.min(seasonAnalysis.seasonStats.lowestScore, team1.points, team2.points);
                seasonAnalysis.seasonStats.closestGame = Math.min(seasonAnalysis.seasonStats.closestGame, margin);
                seasonAnalysis.seasonStats.biggestBlowout = Math.max(seasonAnalysis.seasonStats.biggestBlowout, margin);

                // Generate records
                records.push({
                  type: margin > 50 ? 'blowout' : 'closeGame',
                  season: league.season,
                  week: weekNumber,
                  userId: team1.points > team2.points ? user1.user_id : user2.user_id,
                  username: team1.points > team2.points ? user1.display_name : user2.display_name,
                  avatar: team1.points > team2.points ? user1.avatar : user2.avatar,
                  value: margin,
                  description: `${team1.points > team2.points ? user1.display_name : user2.display_name} won by ${margin.toFixed(2)} points in Week ${weekNumber}`,
                  details: {
                    winner: team1.points > team2.points ? user1.display_name : user2.display_name,
                    loser: team1.points > team2.points ? user2.display_name : user1.display_name,
                    winnerScore: Math.max(team1.points, team2.points),
                    loserScore: Math.min(team1.points, team2.points),
                  }
                });
              }
            }
          }
        });

        // Calculate week average
        const validScores = weekMatchups.filter(m => typeof m.points === 'number' && m.points > 0).map(m => m.points);
        if (validScores.length > 0) {
          weekStats.averageScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
        }

        seasonAnalysis.weeklyStats[weekNumber] = weekStats;
      }

      // Calculate user season stats
      users.forEach(user => {
        const userStats = seasonAnalysis.userSeasonStats[user.user_id];
        const roster = rosters.find(r => r.owner_id === user.user_id);
        
        if (roster) {
          userStats.finalRank = roster.settings.rank || 0;
          
          // Use roster settings for wins/losses/ties (these already account for median games if enabled)
          userStats.wins = roster.settings.wins || 0;
          userStats.losses = roster.settings.losses || 0;
          userStats.ties = roster.settings.ties || 0;
          
          userStats.highestScore = Math.max(...userStats.weeklyScores);
          userStats.lowestScore = Math.min(...userStats.weeklyScores);
          userStats.averageScore = userStats.weeklyScores.reduce((sum, score) => sum + score, 0) / userStats.weeklyScores.length;

          // Calculate win/loss streaks
          let currentWinStreak = 0;
          let currentLossStreak = 0;
          let maxWinStreak = 0;
          let maxLossStreak = 0;

          for (let i = 0; i < userStats.weeklyScores.length; i++) {
            const weekMatchup = allMatchups[i]?.find(m => {
              const userRoster = rosters.find(r => r.roster_id === m.roster_id);
              return userRoster && userRoster.owner_id === user.user_id;
            });

            if (weekMatchup) {
              const opponentMatchup = allMatchups[i]?.find(m => 
                m.matchup_id === weekMatchup.matchup_id && m.roster_id !== weekMatchup.roster_id
              );

              if (opponentMatchup && typeof weekMatchup.points === 'number' && typeof opponentMatchup.points === 'number') {
                if (weekMatchup.points > opponentMatchup.points) {
                  currentWinStreak++;
                  currentLossStreak = 0;
                  maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                } else if (weekMatchup.points < opponentMatchup.points) {
                  currentLossStreak++;
                  currentWinStreak = 0;
                  maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
                }
              }
            }
          }

          userStats.winStreak = maxWinStreak;
          userStats.lossStreak = maxLossStreak;
        }
      });

      // Find regular season champion (best record)
      const sortedRosters = [...rosters].sort((a, b) => {
        const aWins = a.settings.wins || 0;
        const bWins = b.settings.wins || 0;
        if (aWins !== bWins) return bWins - aWins;
        
        const aPoints = (a.settings.fpts || 0) + (a.settings.fpts_decimal || 0) / 100;
        const bPoints = (b.settings.fpts || 0) + (b.settings.fpts_decimal || 0) / 100;
        return bPoints - aPoints;
      });

      if (sortedRosters.length > 0) {
        const regularSeasonChampRoster = sortedRosters[0];
        const regularSeasonChampUser = users.find(u => u.user_id === regularSeasonChampRoster.owner_id);
        if (regularSeasonChampUser) {
          seasonAnalysis.regularSeasonChamp = { ...regularSeasonChampRoster, user: regularSeasonChampUser };
        }
      }

      // Process playoffs
      const playoffWeeks = allMatchups.slice(regularSeasonWeeks);
      if (playoffWeeks.length > 0) {
        // Find playoff teams using league settings and roster rankings
        const playoffTeams = league.settings.playoff_teams || 6;
        
        rosters.forEach(roster => {
          const rosterRank = roster.settings.rank || 0;
          const user = users.find(u => u.user_id === roster.owner_id);
          
          // A team makes playoffs if they finish in the top N spots (where N = playoff_teams)
          if (user && rosterRank > 0 && rosterRank <= playoffTeams) {
            seasonAnalysis.playoffTeams.push({ ...roster, user });
            seasonAnalysis.userSeasonStats[user.user_id].playoffAppearance = true;
            console.log(`Playoff team detected: ${user.display_name} finished ${rosterRank}/${league.settings.num_teams} in ${league.season}`);
          }
        });

        // Find champion
        const finalWeek = playoffWeeks[playoffWeeks.length - 1];
        const championshipMatchups = finalWeek.filter(m => typeof m.points === 'number' && m.points > 0);
        
        if (championshipMatchups.length >= 2) {
          const matchupGroups = new Map<number, any[]>();
          championshipMatchups.forEach(matchup => {
            if (!matchupGroups.has(matchup.matchup_id)) {
              matchupGroups.set(matchup.matchup_id, []);
            }
            matchupGroups.get(matchup.matchup_id)!.push(matchup);
          });
          
          const championshipGame = Array.from(matchupGroups.values()).find(group => group.length === 2);
          
          if (championshipGame) {
            const [team1, team2] = championshipGame;
            const winner = team1.points > team2.points ? team1 : team2;
            const loser = team1.points > team2.points ? team2 : team1;
            
            const championRoster = rosters.find(r => r.roster_id === winner.roster_id);
            const championUser = championRoster ? users.find(u => u.user_id === championRoster.owner_id) : null;
            
            if (championUser) {
              seasonAnalysis.champions.push({ ...championRoster, user: championUser });
              seasonAnalysis.userSeasonStats[championUser.user_id].championship = true;
              
              const championshipKey = `${league.season}-${championUser.user_id}`;
              if (!processedChampionships.has(championshipKey)) {
                processedChampionships.add(championshipKey);
                records.push({
                  type: 'championship',
                  season: league.season,
                  userId: championUser.user_id,
                  username: championUser.display_name,
                  avatar: championUser.avatar,
                  value: 1,
                  description: `${championUser.display_name} won the ${league.season} championship`,
                  details: {
                    championshipScore: winner.points,
                    opponentScore: loser.points,
                    playoffWeeks: playoffWeeks.length,
                    season: league.season,
                  }
                });
              }
            }
          }
        }
      }

      // Generate season records
      users.forEach(user => {
        const userStats = seasonAnalysis.userSeasonStats[user.user_id];
        
        // High score record
        if (userStats.highestScore > 0) {
          records.push({
            type: 'highScore',
            season: league.season,
            userId: user.user_id,
            username: user.display_name,
            avatar: user.avatar,
            value: userStats.highestScore,
            description: `${user.display_name} scored ${userStats.highestScore.toFixed(2)} points`,
          });
        }

        // Low score record
        if (userStats.lowestScore < Infinity) {
          records.push({
            type: 'lowScore',
            season: league.season,
            userId: user.user_id,
            username: user.display_name,
            avatar: user.avatar,
            value: userStats.lowestScore,
            description: `${user.display_name} scored ${userStats.lowestScore.toFixed(2)} points`,
          });
        }

        // Win streak record
        if (userStats.winStreak > 0) {
          records.push({
            type: 'winStreak',
            season: league.season,
            userId: user.user_id,
            username: user.display_name,
            avatar: user.avatar,
            value: userStats.winStreak,
            description: `${user.display_name} had a ${userStats.winStreak}-game win streak`,
          });
        }

        // Loss streak record
        if (userStats.lossStreak > 0) {
          records.push({
            type: 'lossStreak',
            season: league.season,
            userId: user.user_id,
            username: user.display_name,
            avatar: user.avatar,
            value: userStats.lossStreak,
            description: `${user.display_name} had a ${userStats.lossStreak}-game loss streak`,
          });
        }

        // Playoff appearance record
        if (userStats.playoffAppearance) {
          records.push({
            type: 'playoffAppearance',
            season: league.season,
            userId: user.user_id,
            username: user.display_name,
            avatar: user.avatar,
            value: 1,
            description: `${user.display_name} made the playoffs in ${league.season}`,
            details: {
              rank: userStats.finalRank,
              record: `${userStats.wins}-${userStats.losses}${userStats.ties > 0 ? `-${userStats.ties}` : ''}`,
            }
          });
        }
      });

      // Update season totals
      rosters.forEach(roster => {
        // Update season stats from roster settings (these already account for median games if enabled)
        seasonAnalysis.seasonStats.totalGames += (roster.settings.wins || 0) + (roster.settings.losses || 0) + (roster.settings.ties || 0);
        seasonAnalysis.seasonStats.totalPoints += (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100;
        seasonAnalysis.seasonStats.mostWins = Math.max(seasonAnalysis.seasonStats.mostWins, roster.settings.wins || 0);
        seasonAnalysis.seasonStats.mostPoints = Math.max(seasonAnalysis.seasonStats.mostPoints, (roster.settings.fpts || 0) + (roster.settings.fpts_decimal || 0) / 100);
      });

      seasonAnalysis.seasonStats.averageScore = seasonAnalysis.seasonStats.totalGames > 0 ? seasonAnalysis.seasonStats.totalPoints / seasonAnalysis.seasonStats.totalGames : 0;
      seasonAnalysis.seasonStats.lowestScore = seasonAnalysis.seasonStats.lowestScore === Infinity ? 0 : seasonAnalysis.seasonStats.lowestScore;
      seasonAnalysis.seasonStats.closestGame = seasonAnalysis.seasonStats.closestGame === Infinity ? 0 : seasonAnalysis.seasonStats.closestGame;

      seasonAnalyses.push(seasonAnalysis);

    } catch (error) {
      console.error(`Failed to generate history for league ${leagueId}:`, error);
      continue;
    }
  }

  // Calculate all-time stats
  const allTimeStats = {
    totalSeasons: seasonAnalyses.length,
    totalGames: 0,
    totalPoints: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: Infinity,
    closestGame: Infinity,
    biggestBlowout: 0,
    mostChampionships: 0,
    mostPlayoffAppearances: 0,
    longestWinStreak: 0,
    longestLossStreak: 0,
  };

  // Aggregate user all-time stats
  seasonAnalyses.forEach(analysis => {
    allTimeStats.totalGames += analysis.seasonStats.totalGames;
    allTimeStats.totalPoints += analysis.seasonStats.totalPoints;
    allTimeStats.highestScore = Math.max(allTimeStats.highestScore, analysis.seasonStats.highestScore);
    allTimeStats.lowestScore = Math.min(allTimeStats.lowestScore, analysis.seasonStats.lowestScore);
    allTimeStats.closestGame = Math.min(allTimeStats.closestGame, analysis.seasonStats.closestGame);
    allTimeStats.biggestBlowout = Math.max(allTimeStats.biggestBlowout, analysis.seasonStats.biggestBlowout);

    Object.entries(analysis.userSeasonStats).forEach(([userId, stats]) => {
      if (!userAllTimeStats[userId]) {
        const user = analysis.users.find(u => u.user_id === userId);
        if (user) {
          userAllTimeStats[userId] = {
            username: user.display_name,
            avatar: user.avatar,
            totalWins: 0,
            totalLosses: 0,
            totalTies: 0,
            totalPoints: 0,
            championships: 0,
            playoffAppearances: 0,
            winPercentage: 0,
            averagePointsPerGame: 0,
            seasonsPlayed: 0,
            highestScore: 0,
            lowestScore: Infinity,
            longestWinStreak: 0,
            longestLossStreak: 0,
            bestFinish: Infinity,
            worstFinish: 0,
          };
        }
      }

      if (userAllTimeStats[userId]) {
        const allTimeUser = userAllTimeStats[userId];
        allTimeUser.totalWins += stats.wins;
        allTimeUser.totalLosses += stats.losses;
        allTimeUser.totalTies += stats.ties;
        allTimeUser.totalPoints += stats.pointsFor;
        allTimeUser.seasonsPlayed++;
        allTimeUser.highestScore = Math.max(allTimeUser.highestScore, stats.highestScore);
        allTimeUser.lowestScore = Math.min(allTimeUser.lowestScore, stats.lowestScore);
        allTimeUser.longestWinStreak = Math.max(allTimeUser.longestWinStreak, stats.winStreak);
        allTimeUser.longestLossStreak = Math.max(allTimeUser.longestLossStreak, stats.lossStreak);
        allTimeUser.bestFinish = Math.min(allTimeUser.bestFinish, stats.finalRank);
        allTimeUser.worstFinish = Math.max(allTimeUser.worstFinish, stats.finalRank);

        if (stats.championship) allTimeUser.championships++;
        if (stats.playoffAppearance) allTimeUser.playoffAppearances++;
      }
    });
  });

  // Calculate final all-time stats
  allTimeStats.averageScore = allTimeStats.totalGames > 0 ? allTimeStats.totalPoints / allTimeStats.totalGames : 0;
  allTimeStats.lowestScore = allTimeStats.lowestScore === Infinity ? 0 : allTimeStats.lowestScore;
  allTimeStats.closestGame = allTimeStats.closestGame === Infinity ? 0 : allTimeStats.closestGame;

  Object.values(userAllTimeStats).forEach(user => {
    const totalGames = user.totalWins + user.totalLosses + user.totalTies;
    user.winPercentage = totalGames > 0 ? (user.totalWins + user.totalTies * 0.5) / totalGames * 100 : 0;
    // Note: PPG is calculated using total points divided by total games (including median games)
    // This gives the true average points per game, not halved for median games
    user.averagePointsPerGame = totalGames > 0 ? user.totalPoints / totalGames : 0;
    user.lowestScore = user.lowestScore === Infinity ? 0 : user.lowestScore;
    user.bestFinish = user.bestFinish === Infinity ? 0 : user.bestFinish;

    allTimeStats.mostChampionships = Math.max(allTimeStats.mostChampionships, user.championships);
    allTimeStats.mostPlayoffAppearances = Math.max(allTimeStats.mostPlayoffAppearances, user.playoffAppearances);
    allTimeStats.longestWinStreak = Math.max(allTimeStats.longestWinStreak, user.longestWinStreak);
    allTimeStats.longestLossStreak = Math.max(allTimeStats.longestLossStreak, user.longestLossStreak);
  });

  return {
    records: records.sort((a, b) => b.value - a.value),
    seasonAnalyses,
    allTimeStats,
    userAllTimeStats,
  };
} 