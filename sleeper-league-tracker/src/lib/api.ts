import {
  SleeperLeague,
  SleeperMatchup,
  SleeperNFLState,
  SleeperRoster,
  SleeperUser,
} from "@/types/sleeper";

const SLEEPER_API_BASE = "https://api.sleeper.app/v1";

export async function getLeagueInfo(leagueId: string): Promise<SleeperLeague> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league info: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league users: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league rosters: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league matchups: ${response.statusText}`);
  }
  return response.json();
}

export async function getNFLState(): Promise<SleeperNFLState> {
  const response = await fetch(`${SLEEPER_API_BASE}/state/nfl`);
  if (!response.ok) {
    throw new Error(`Failed to fetch NFL state: ${response.statusText}`);
  }
  return response.json();
}

// New functions for multi-season support

export async function getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/user/${userId}/leagues/nfl/${season}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch user leagues: ${response.statusText}`);
  }
  return response.json();
}

export async function getLeaguePreviousSeason(leagueId: string): Promise<string | null> {
  const league = await getLeagueInfo(leagueId);
  return league.previous_league_id || null;
}

// Helper function to get all seasons for a league
export async function getAllLeagueSeasons(currentLeagueId: string): Promise<SleeperLeague[]> {
  const seasons: SleeperLeague[] = [];
  let currentId = currentLeagueId;

  while (currentId) {
    try {
      const league = await getLeagueInfo(currentId);
      seasons.unshift(league); // Add to beginning to maintain chronological order
      currentId = league.previous_league_id || '';
    } catch (error) {
      break; // Stop if we can't fetch more seasons
    }
  }

  return seasons;
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
  const seasons = await getAllLeagueSeasons(leagueId);
  const statsMap = new Map<string, AggregatedStats>();

  for (const season of seasons) {
    const [users, rosters] = await Promise.all([
      getLeagueUsers(season.league_id),
      getLeagueRosters(season.league_id),
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
      if (roster.roster_id <= season.settings.playoff_teams) {
        existingStats.playoffAppearances += 1;
      }

      // Calculate averages
      const totalGames = existingStats.totalWins + existingStats.totalLosses + existingStats.totalTies;
      existingStats.winPercentage = (existingStats.totalWins + existingStats.totalTies * 0.5) / totalGames * 100;
      existingStats.averagePointsPerGame = existingStats.totalPoints / totalGames;

      statsMap.set(user.user_id, existingStats);
    });
  }

  return Array.from(statsMap.values());
} 