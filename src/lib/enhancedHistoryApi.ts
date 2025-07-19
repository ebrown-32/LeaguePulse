import { 
  getLeagueInfo, 
  getLeagueUsers, 
  getLeagueRosters, 
  getLeagueMatchups, 
  getLeagueWeeks,
  getAllLinkedLeagueIds,
  getNFLState,
  getPlayoffBracket
} from './api';

// Enhanced types for better data accuracy
export interface EnhancedHistoricalRecord {
  type: 'championship' | 'playoff' | 'highScore' | 'lowScore' | 'winStreak' | 'lossStreak' | 
        'blowout' | 'closeGame' | 'consistency' | 'explosiveness' | 'seasonHigh' | 'seasonLow' | 
        'playoffAppearance' | 'regularSeasonChamp' | 'perfectSeason' | 'mostImproved' | 'biggestUpset' |
        'runnerUp' | 'championshipGame' | 'playoffHighScore' | 'playoffLowScore';
  season: string;
  week?: number;
  userId: string;
  username: string;
  avatar: string;
  value: number;
  description: string;
  details?: {
    winnerScore?: number;
    loserScore?: number;
    opponent?: string;
    rank?: number;
    record?: string;
    margin?: number;
    streak?: number;
    previousValue?: number;
    pointsFor?: number;
  };
  isAllTime?: boolean;
  isPlayoff?: boolean;
  contextualRank?: number; // Ranking within this record type
}

export interface EnhancedUserStats {
  userId: string;
  username: string;
  avatar: string;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  regularSeasonWins: number;
  regularSeasonLosses: number;
  playoffWins: number;
  playoffLosses: number;
  totalPoints: number;
  totalPointsAgainst: number;
  championships: number;
  playoffAppearances: number;
  regularSeasonChampionships: number;
  winPercentage: number;
  playoffWinPercentage: number;
  averagePointsPerGame: number;
  averagePointsAgainst: number;
  seasonsPlayed: number;
  highestScore: number;
  lowestScore: number;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  streakType: 'W' | 'L' | 'T' | null;
  bestFinish: number;
  worstFinish: number;
  averageFinish: number;
  pointsPerSeasonAverage: number;
  consistencyScore: number; // Lower variance = more consistent
  explosiveGames: number; // Games scoring 20+ points above average
  duds: number; // Games scoring 20+ points below average
  headToHeadRecord: { [opponentId: string]: { wins: number; losses: number; ties: number } };
  seasonBySeasonStats: {
    [season: string]: {
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      finish: number;
      playoffAppearance: boolean;
      championship: boolean;
      regularSeasonChamp: boolean;
    };
  };
}

export interface EnhancedLeagueHistory {
  records: EnhancedHistoricalRecord[];
  allTimeStats: EnhancedUserStats[];
  seasonStats: {
    [season: string]: {
      leagueId: string;
      totalGames: number;
      averageScore: number;
      highestScore: number;
      lowestScore: number;
      playoffWeekStart: number;
      playoffWeekEnd: number;
      championshipWeekStart: number;
      championshipWeekEnd: number;
      regularSeasonChampion: string;
      champion: string;
      scoringSettings: any;
      rosterSettings: any;
    };
  };
  leagueMetadata: {
    totalSeasons: number;
    currentSeason: string;
    linkedLeagueIds: string[];
    foundationYear: string;
    allTimeHighScore: number;
    allTimeLowScore: number;
    mostChampionships: number;
    averageLeagueScore: number;
    totalGamesPlayed: number;
  };
}

// Enhanced history generation with improved accuracy and performance
export async function generateEnhancedLeagueHistory(
  initialLeagueId: string,
  progressCallback?: (progress: number, message: string) => void
): Promise<EnhancedLeagueHistory> {
  const startTime = Date.now();
  
  try {
    // Step 1: Get all linked league IDs
    progressCallback?.(5, 'Discovering linked leagues...');
    const linkedLeagueIds = await getAllLinkedLeagueIds(initialLeagueId);
    
    if (linkedLeagueIds.length === 0) {
      throw new Error('No linked leagues found');
    }

    // Step 2: Initialize data structures
    progressCallback?.(10, 'Initializing data structures...');
    const records: EnhancedHistoricalRecord[] = [];
    const userStatsMap = new Map<string, EnhancedUserStats>();
    const seasonStats: { [season: string]: any } = {};
    
    // Step 3: Get current NFL state to determine active season
    const nflState = await getNFLState();
    const currentSeason = nflState.season;
    
    // Step 4: Process each league/season
    const totalLeagues = linkedLeagueIds.length;
    for (let i = 0; i < totalLeagues; i++) {
      const leagueId = linkedLeagueIds[i];
      const progress = 10 + (i / totalLeagues) * 80;
      
      try {
        progressCallback?.(progress, `Processing season ${i + 1} of ${totalLeagues}...`);
        await processLeagueSeason(leagueId, currentSeason, records, userStatsMap, seasonStats);
      } catch (error) {
        console.error(`Error processing league ${leagueId}:`, error);
        // Continue processing other leagues
      }
    }

    // Step 5: Generate win/loss streaks
    progressCallback?.(85, 'Calculating win/loss streaks...');
    await generateWinLossStreaks(linkedLeagueIds, userStatsMap, records);
    
    // Step 6: Calculate derived statistics and rankings
    progressCallback?.(90, 'Calculating derived statistics...');
    await calculateDerivedStats(userStatsMap, records);
    
    // Step 7: Generate contextual rankings for records
    progressCallback?.(95, 'Generating record rankings...');
    assignRecordRankings(records);
    
    // Step 8: Calculate league metadata
    progressCallback?.(98, 'Finalizing league metadata...');
    const leagueMetadata = calculateLeagueMetadata(linkedLeagueIds, userStatsMap, seasonStats);
    
    progressCallback?.(100, `Complete! Processed ${totalLeagues} seasons in ${Date.now() - startTime}ms`);
    
    return {
      records,
      allTimeStats: Array.from(userStatsMap.values()),
      seasonStats,
      leagueMetadata
    };
    
  } catch (error) {
    console.error('Error generating enhanced league history:', error);
    throw error;
  }
}

// Process a single league season with enhanced data collection
async function processLeagueSeason(
  leagueId: string,
  currentSeason: string,
  records: EnhancedHistoricalRecord[],
  userStatsMap: Map<string, EnhancedUserStats>,
  seasonStats: { [season: string]: any }
): Promise<void> {
  // Get league info and validate
  const league = await getLeagueInfo(leagueId);
  if (!league) {
    throw new Error(`League ${leagueId} not found`);
  }

  // Skip current season if no games have been played
  if (league.season === currentSeason) {
    const week1Matchups = await getLeagueMatchups(leagueId, 1);
    const hasGames = week1Matchups.some(m => typeof m.points === 'number' && m.points > 0);
    if (!hasGames) {
      console.log(`Skipping current season ${league.season} - no games played yet`);
      return;
    }
  }

  // Get users and rosters
  const [users, rosters] = await Promise.all([
    getLeagueUsers(leagueId),
    getLeagueRosters(leagueId)
  ]);

  // Initialize season stats
  const playoffWeekStart = league.settings.playoff_week_start || 15;
  const playoffWeekEnd = league.settings.playoff_week_end || 17;
  const championshipWeekStart = league.settings.championship_week_start || 17;
  const championshipWeekEnd = league.settings.championship_week_end || 17;
  
  seasonStats[league.season] = {
    leagueId,
    totalGames: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: Infinity,
    playoffWeekStart,
    playoffWeekEnd,
    championshipWeekStart,
    championshipWeekEnd,
    regularSeasonChampion: '',
    champion: '',
    scoringSettings: league.scoring_settings,
    rosterSettings: league.roster_positions
  };

  // Initialize user stats if not exists
  users.forEach(user => {
    if (!userStatsMap.has(user.user_id)) {
      userStatsMap.set(user.user_id, {
        userId: user.user_id,
        username: user.display_name,
        avatar: user.avatar,
        totalWins: 0,
        totalLosses: 0,
        totalTies: 0,
        regularSeasonWins: 0,
        regularSeasonLosses: 0,
        playoffWins: 0,
        playoffLosses: 0,
        totalPoints: 0,
        totalPointsAgainst: 0,
        championships: 0,
        playoffAppearances: 0,
        regularSeasonChampionships: 0,
        winPercentage: 0,
        playoffWinPercentage: 0,
        averagePointsPerGame: 0,
        averagePointsAgainst: 0,
        seasonsPlayed: 0,
        highestScore: 0,
        lowestScore: Infinity,
        longestWinStreak: 0,
        longestLossStreak: 0,
        currentStreak: 0,
        streakType: null,
        bestFinish: Infinity,
        worstFinish: 0,
        averageFinish: 0,
        pointsPerSeasonAverage: 0,
        consistencyScore: 0,
        explosiveGames: 0,
        duds: 0,
        headToHeadRecord: {},
        seasonBySeasonStats: {}
      });
    }
  });

  // Get all matchups for the season
  const totalWeeks = await getLeagueWeeks(leagueId);
  const allMatchups = await Promise.all(
    Array.from({ length: totalWeeks }, (_, i) => 
      getLeagueMatchups(leagueId, i + 1).catch(() => [])
    )
  );

  // Process matchups and calculate stats
  await processMatchupsForSeason(
    league,
    users,
    rosters,
    allMatchups,
    records,
    userStatsMap,
    seasonStats[league.season]
  );

  // Process roster data for accurate win/loss records (accounts for median games)
  await processRosterData(league, rosters, userStatsMap);

  // Determine champions and playoff participants
  await determineChampionsAndPlayoffs(league, rosters, userStatsMap, records);
}

// Enhanced matchup processing with accurate team name assignment
async function processMatchupsForSeason(
  league: any,
  users: any[],
  rosters: any[],
  allMatchups: any[][],
  records: EnhancedHistoricalRecord[],
  userStatsMap: Map<string, EnhancedUserStats>,
  seasonStats: any
): Promise<void> {
  const playoffWeekStart = league.settings.playoff_week_start || 15;
  const userSeasonScores = new Map<string, number[]>();
  
  // Initialize user season scores
  users.forEach(user => {
    userSeasonScores.set(user.user_id, []);
  });

  // Process each week
  for (let weekIndex = 0; weekIndex < allMatchups.length; weekIndex++) {
    const weekMatchups = allMatchups[weekIndex];
    const weekNumber = weekIndex + 1;
    const isPlayoff = weekNumber >= playoffWeekStart;
    
    if (!weekMatchups || weekMatchups.length === 0) continue;

    // Group matchups by matchup_id for head-to-head games
    const matchupGroups = new Map<number, any[]>();
    weekMatchups.forEach(matchup => {
      if (typeof matchup.points === 'number' && matchup.points > 0) {
        if (!matchupGroups.has(matchup.matchup_id)) {
          matchupGroups.set(matchup.matchup_id, []);
        }
        matchupGroups.get(matchup.matchup_id)!.push(matchup);
      }
    });

    // Process each matchup group
    for (const [, group] of matchupGroups) {
      if (group.length === 2) {
        await processHeadToHeadMatchup(
          group,
          users,
          rosters,
          league,
          weekNumber,
          isPlayoff,
          userStatsMap,
          seasonStats,
          records,
          userSeasonScores
        );
      }
    }

    // Process individual scores for records
    weekMatchups.forEach(matchup => {
      if (typeof matchup.points === 'number' && matchup.points > 0) {
        const user = findUserByRoster(matchup.roster_id, users, rosters);
        if (user) {
          userSeasonScores.get(user.user_id)?.push(matchup.points);
          
          // Track high/low scores
          const userStats = userStatsMap.get(user.user_id)!;
          userStats.highestScore = Math.max(userStats.highestScore, matchup.points);
          userStats.lowestScore = Math.min(userStats.lowestScore, matchup.points);
          
          // Update season stats
          seasonStats.highestScore = Math.max(seasonStats.highestScore, matchup.points);
          seasonStats.lowestScore = Math.min(seasonStats.lowestScore, matchup.points);
        }
      }
    });
  }

  // Generate weekly high/low score records
  generateWeeklyScoreRecords(allMatchups, users, rosters, league, records);
}

// Process head-to-head matchup with accurate team assignment
async function processHeadToHeadMatchup(
  matchup: any[],
  users: any[],
  rosters: any[],
  league: any,
  weekNumber: number,
  isPlayoff: boolean,
  userStatsMap: Map<string, EnhancedUserStats>,
  seasonStats: any,
  records: EnhancedHistoricalRecord[],
  _userSeasonScores: Map<string, number[]>
): Promise<void> {
  const [team1, team2] = matchup;
  const user1 = findUserByRoster(team1.roster_id, users, rosters);
  const user2 = findUserByRoster(team2.roster_id, users, rosters);
  
  if (!user1 || !user2) return;

  const userStats1 = userStatsMap.get(user1.user_id)!;
  const userStats2 = userStatsMap.get(user2.user_id)!;

  // Calculate game margin
  const margin = Math.abs(team1.points - team2.points);
  const winner = team1.points > team2.points ? user1 : user2;
  const loser = team1.points > team2.points ? user2 : user1;
  const winnerScore = Math.max(team1.points, team2.points);
  const loserScore = Math.min(team1.points, team2.points);

  // Update head-to-head records
  if (!userStats1.headToHeadRecord[user2.user_id]) {
    userStats1.headToHeadRecord[user2.user_id] = { wins: 0, losses: 0, ties: 0 };
  }
  if (!userStats2.headToHeadRecord[user1.user_id]) {
    userStats2.headToHeadRecord[user1.user_id] = { wins: 0, losses: 0, ties: 0 };
  }

  if (team1.points > team2.points) {
    userStats1.headToHeadRecord[user2.user_id].wins++;
    userStats2.headToHeadRecord[user1.user_id].losses++;
  } else if (team1.points < team2.points) {
    userStats1.headToHeadRecord[user2.user_id].losses++;
    userStats2.headToHeadRecord[user1.user_id].wins++;
  } else {
    userStats1.headToHeadRecord[user2.user_id].ties++;
    userStats2.headToHeadRecord[user1.user_id].ties++;
  }

  // Update total points
  userStats1.totalPoints += team1.points;
  userStats2.totalPoints += team2.points;
  userStats1.totalPointsAgainst += team2.points;
  userStats2.totalPointsAgainst += team1.points;

  // Update season stats
  seasonStats.totalGames++;

  // Generate records for all games (we'll filter top ones later)
  // Blowout record (any margin > 30 points to get more data)
  if (margin > 30) {
    records.push({
      type: 'blowout',
      season: league.season,
      week: weekNumber,
      userId: winner.user_id,
      username: winner.display_name,
      avatar: winner.avatar,
      value: margin,
      description: `${winner.display_name} defeated ${loser.display_name} by ${margin.toFixed(2)} points in Week ${weekNumber}`,
      details: {
        winnerScore,
        loserScore,
        opponent: loser.display_name,
        margin
      },
      isPlayoff
    });
  }
  
  // Close game record (any margin < 10 points to get more data)
  if (margin < 10 && margin > 0) {
    records.push({
      type: 'closeGame',
      season: league.season,
      week: weekNumber,
      userId: winner.user_id,
      username: winner.display_name,
      avatar: winner.avatar,
      value: margin,
      description: `${winner.display_name} narrowly beat ${loser.display_name} by ${margin.toFixed(2)} points in Week ${weekNumber}`,
      details: {
        winnerScore,
        loserScore,
        opponent: loser.display_name,
        margin
      },
      isPlayoff
    });
  }

  // Update season stats
  seasonStats.closestGame = Math.min(seasonStats.closestGame, margin);
  seasonStats.biggestBlowout = Math.max(seasonStats.biggestBlowout, margin);
}

// Find user by roster ID with accurate team name assignment
function findUserByRoster(rosterId: number, users: any[], rosters: any[]): any | null {
  const roster = rosters.find(r => r.roster_id === rosterId);
  if (!roster) return null;
  
  const user = users.find(u => u.user_id === roster.owner_id);
  return user || null;
}

// Process roster data for accurate win/loss records
async function processRosterData(
  league: any,
  rosters: any[],
  userStatsMap: Map<string, EnhancedUserStats>
): Promise<void> {
  // const playoffWeekStart = league.settings.playoff_week_start || 15;
  
  rosters.forEach(roster => {
    const userStats = userStatsMap.get(roster.owner_id);
    if (!userStats) return;

    // Use roster wins/losses/ties as they account for median games
    const wins = roster.settings?.wins || 0;
    const losses = roster.settings?.losses || 0;
    const ties = roster.settings?.ties || 0;

    // Update user stats for this season
    userStats.totalWins += wins;
    userStats.totalLosses += losses;
    userStats.totalTies += ties;
    userStats.seasonsPlayed++;

    // Assume regular season games (we'll update playoff stats separately)
    userStats.regularSeasonWins += wins;
    userStats.regularSeasonLosses += losses;

    // Update season-by-season stats
    userStats.seasonBySeasonStats[league.season] = {
      wins,
      losses,
      ties,
      pointsFor: roster.settings?.fpts || 0,
      pointsAgainst: roster.settings?.fpts_against || 0,
      finish: 0, // Will be calculated later
      playoffAppearance: false, // Will be calculated later
      championship: false, // Will be calculated later
      regularSeasonChamp: false // Will be calculated later
    };
  });
}

// Generate comprehensive weekly records
function generateWeeklyScoreRecords(
  allMatchups: any[][],
  users: any[],
  rosters: any[],
  league: any,
  records: EnhancedHistoricalRecord[]
): void {
  const weeklyHighScores: { score: number; user: any; week: number; isPlayoff: boolean }[] = [];
  const weeklyLowScores: { score: number; user: any; week: number; isPlayoff: boolean }[] = [];
  const playoffHighScores: { score: number; user: any; week: number }[] = [];
  const playoffLowScores: { score: number; user: any; week: number }[] = [];
  
  allMatchups.forEach((weekMatchups, weekIndex) => {
    if (!weekMatchups || weekMatchups.length === 0) return;

    const weekNumber = weekIndex + 1;
    const isPlayoff = weekNumber >= (league.settings.playoff_week_start || 15);

    // Collect all scores for this week
    const weekScores: { score: number; user: any }[] = [];
    
    weekMatchups.forEach(matchup => {
      if (typeof matchup.points === 'number' && matchup.points > 0) {
        const user = findUserByRoster(matchup.roster_id, users, rosters);
        if (user) {
          weekScores.push({ score: matchup.points, user });
        }
      }
    });

    if (weekScores.length === 0) return;

    // Sort scores for this week
    weekScores.sort((a, b) => b.score - a.score);
    
    // Add all scores to respective arrays for global ranking
    weekScores.forEach(({ score, user }) => {
      weeklyHighScores.push({ score, user, week: weekNumber, isPlayoff });
      weeklyLowScores.push({ score, user, week: weekNumber, isPlayoff });
      
      if (isPlayoff) {
        playoffHighScores.push({ score, user, week: weekNumber });
        playoffLowScores.push({ score, user, week: weekNumber });
      }
    });
  });

  // Sort and take top/bottom scores across all weeks
  weeklyHighScores.sort((a, b) => b.score - a.score);
  weeklyLowScores.sort((a, b) => a.score - b.score);
  playoffHighScores.sort((a, b) => b.score - a.score);
  playoffLowScores.sort((a, b) => a.score - b.score);

  // Generate high score records (top 50 to ensure we have enough good ones)
  weeklyHighScores.slice(0, 50).forEach(({ score, user, week, isPlayoff }) => {
    records.push({
      type: isPlayoff ? 'playoffHighScore' : 'highScore',
      season: league.season,
      week,
      userId: user.user_id,
      username: user.display_name,
      avatar: user.avatar,
      value: score,
      description: `${user.display_name} scored ${score.toFixed(2)} points in Week ${week}${isPlayoff ? ' (Playoffs)' : ''}`,
      isPlayoff
    });
  });

  // Generate low score records (bottom 50, but filter out obvious bye weeks)
  weeklyLowScores
    .filter(({ score }) => score > 0 && score < 200) // Filter out bye weeks and impossibly high scores
    .slice(0, 50)
    .forEach(({ score, user, week, isPlayoff }) => {
      records.push({
        type: isPlayoff ? 'playoffLowScore' : 'lowScore',
        season: league.season,
        week,
        userId: user.user_id,
        username: user.display_name,
        avatar: user.avatar,
        value: score,
        description: `${user.display_name} scored only ${score.toFixed(2)} points in Week ${week}${isPlayoff ? ' (Playoffs)' : ''}`,
        isPlayoff
      });
    });
}

// Determine champions and playoff participants
async function determineChampionsAndPlayoffs(
  league: any,
  rosters: any[],
  userStatsMap: Map<string, EnhancedUserStats>,
  records: EnhancedHistoricalRecord[]
): Promise<void> {
  // Sort rosters by playoff rank (1 = champion, 2 = runner-up, etc.)
  const sortedRosters = [...rosters].sort((a, b) => {
    const aRank = a.settings?.poff || 999;
    const bRank = b.settings?.poff || 999;
    return aRank - bRank;
  });

  // Determine playoff participants (teams with poff value and poff > 0)
  const playoffTeams = sortedRosters.filter(roster => 
    roster.settings?.poff && roster.settings.poff > 0
  );
  
  // Champion is team with poff = 1 (verified winner)
  let champion = playoffTeams.find(roster => roster.settings?.poff === 1);
  let runnerUp = playoffTeams.find(roster => roster.settings?.poff === 2);
  
  // If no champion found via poff, try using playoff bracket API
  if (!champion) {
    try {
      console.log(`Season ${league.season}: Attempting to find champion via playoff bracket API`);
      const playoffBracket = await getPlayoffBracket(league.league_id);
      
      if (playoffBracket?.winners_bracket) {
        // Find the final matchup in winners bracket
        const finalMatchup = playoffBracket.winners_bracket
          .filter((matchup: any) => matchup && typeof matchup.r === 'number')
          .sort((a: any, b: any) => b.r - a.r)[0]; // Highest round should be championship
        
        if (finalMatchup && finalMatchup.w) {
          // The winner (w) field contains the roster_id of the champion
          champion = rosters.find(r => r.roster_id === finalMatchup.w);
          
          // Find runner-up from the same matchup
          if (finalMatchup.m && finalMatchup.m.length === 2) {
            const loserRosterId = finalMatchup.m.find((id: number) => id !== finalMatchup.w);
            if (loserRosterId) {
              runnerUp = rosters.find(r => r.roster_id === loserRosterId);
            }
          }
          
          if (champion) {
            console.log(`Season ${league.season}: Found champion via playoff bracket - Roster ID: ${champion.roster_id}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch playoff bracket for season ${league.season}:`, error);
      
      // Fallback: try to determine from championship week matchups
      if (league.settings) {
        try {
          const championshipWeek = league.settings.championship_week_start || league.settings.playoff_week_end || 17;
          const championshipMatchups = await getLeagueMatchups(league.league_id, championshipWeek);
          
          if (championshipMatchups && championshipMatchups.length > 0) {
            // Find the championship game (highest matchup_id is usually the championship)
            const validMatchups = championshipMatchups.filter(m => m.points !== null && m.points > 0);
            
            if (validMatchups.length >= 2) {
              const championshipGame = validMatchups.reduce((prev, current) => 
                (current.matchup_id > prev.matchup_id) ? current : prev
              );
              
              // Get all matchups for this championship game
              const gameMatchups = championshipMatchups.filter(m => m.matchup_id === championshipGame.matchup_id);
              
              if (gameMatchups.length === 2) {
                // Find the winner (higher score)
                const [team1, team2] = gameMatchups;
                const winningMatchup = team1.points > team2.points ? team1 : team2;
                const losingMatchup = team1.points > team2.points ? team2 : team1;
                
                // Find the corresponding rosters
                champion = rosters.find(r => r.roster_id === winningMatchup.roster_id);
                runnerUp = rosters.find(r => r.roster_id === losingMatchup.roster_id);
                
                console.log(`Season ${league.season}: Found champion via championship game fallback - Week ${championshipWeek}, Winner: ${winningMatchup.points}, Runner-up: ${losingMatchup.points}`);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch championship week for season ${league.season}:`, error);
        }
      }
    }
  }
  
  // Regular season champion is team with best regular season record
  const regularSeasonChamp = [...rosters].sort((a, b) => {
    const aWins = a.settings?.wins || 0;
    const bWins = b.settings?.wins || 0;
    const aPointsFor = a.settings?.fpts || 0;
    const bPointsFor = b.settings?.fpts || 0;
    
    if (aWins !== bWins) return bWins - aWins;
    return bPointsFor - aPointsFor;
  })[0];

  // If still no champion, try alternative approaches
  if (!champion) {
    // Try to find a team with the highest playoff points or wins
    const potentialChampions = rosters.filter(r => {
      const wins = r.settings?.wins || 0;
      const playoffWins = r.settings?.poffs || 0; // playoff wins
      return wins > 0 || playoffWins > 0;
    }).sort((a, b) => {
      // Sort by regular season wins first, then by total points
      const aWins = a.settings?.wins || 0;
      const bWins = b.settings?.wins || 0;
      const aPoints = a.settings?.fpts || 0;
      const bPoints = b.settings?.fpts || 0;
      
      if (aWins !== bWins) return bWins - aWins;
      return bPoints - aPoints;
    });
    
    // For completed seasons with no clear playoff data, assume the team with the best record won
    if (potentialChampions.length > 0 && league.status === 'complete') {
      champion = potentialChampions[0];
      console.log(`Season ${league.season}: Using best regular season record as champion fallback - ${champion.settings?.wins || 0} wins`);
    }
  }

  console.log(`Season ${league.season}: Champion poff=${champion?.settings?.poff}, Runner-up poff=${runnerUp?.settings?.poff}, Total playoff teams: ${playoffTeams.length}, Champion found: ${!!champion}`);

  // Update user stats for champion
  if (champion) {
    const userStats = userStatsMap.get(champion.owner_id);
    if (userStats) {
      userStats.championships++;
      userStats.seasonBySeasonStats[league.season].championship = true;
      userStats.bestFinish = Math.min(userStats.bestFinish, 1);
      
      // Add championship record
      records.push({
        type: 'championship',
        season: league.season,
        userId: champion.owner_id,
        username: userStats.username,
        avatar: userStats.avatar,
        value: 1,
        description: `${userStats.username} won the ${league.season} championship`,
        details: {
          rank: 1,
          record: `${champion.settings?.wins || 0}-${champion.settings?.losses || 0}${champion.settings?.ties ? `-${champion.settings.ties}` : ''}`,
          pointsFor: champion.settings?.fpts || 0
        },
        isPlayoff: true
      });
    }
  }

  // Update user stats for runner-up
  if (runnerUp) {
    const userStats = userStatsMap.get(runnerUp.owner_id);
    if (userStats) {
      userStats.bestFinish = Math.min(userStats.bestFinish, 2);
      
      // Add runner-up record
      records.push({
        type: 'runnerUp',
        season: league.season,
        userId: runnerUp.owner_id,
        username: userStats.username,
        avatar: userStats.avatar,
        value: 2,
        description: `${userStats.username} finished as runner-up in ${league.season}`,
        details: {
          rank: 2,
          record: `${runnerUp.settings?.wins || 0}-${runnerUp.settings?.losses || 0}${runnerUp.settings?.ties ? `-${runnerUp.settings.ties}` : ''}`,
          pointsFor: runnerUp.settings?.fpts || 0
        },
        isPlayoff: true
      });
    }
  }

  if (regularSeasonChamp) {
    const userStats = userStatsMap.get(regularSeasonChamp.owner_id);
    if (userStats) {
      userStats.regularSeasonChampionships++;
      userStats.seasonBySeasonStats[league.season].regularSeasonChamp = true;
      
      // Add regular season championship record
      records.push({
        type: 'regularSeasonChamp',
        season: league.season,
        userId: regularSeasonChamp.owner_id,
        username: userStats.username,
        avatar: userStats.avatar,
        value: regularSeasonChamp.settings?.wins || 0,
        description: `${userStats.username} won the ${league.season} regular season with ${regularSeasonChamp.settings?.wins || 0} wins`
      });
    }
  }

  // Update playoff appearances and final rankings
  playoffTeams.forEach(roster => {
    const userStats = userStatsMap.get(roster.owner_id);
    if (userStats) {
      userStats.playoffAppearances++;
      userStats.seasonBySeasonStats[league.season].playoffAppearance = true;
      
      const finalRank = roster.settings?.poff || 999;
      userStats.seasonBySeasonStats[league.season].finish = finalRank;
      userStats.bestFinish = Math.min(userStats.bestFinish, finalRank);
      userStats.worstFinish = Math.max(userStats.worstFinish, finalRank);
      
      // Add playoff appearance record
      records.push({
        type: 'playoffAppearance',
        season: league.season,
        userId: roster.owner_id,
        username: userStats.username,
        avatar: userStats.avatar,
        value: finalRank,
        description: `${userStats.username} made the playoffs, finishing ${finalRank}${getOrdinalSuffix(finalRank)}`,
        details: {
          rank: finalRank
        },
        isPlayoff: true
      });
    }
  });
}

// Generate win/loss streaks across all seasons
async function generateWinLossStreaks(
  linkedLeagueIds: string[],
  userStatsMap: Map<string, EnhancedUserStats>,
  records: EnhancedHistoricalRecord[]
): Promise<void> {
  // Track streaks for each user across all seasons
  const userStreaks = new Map<string, { 
    currentWinStreak: number; 
    currentLossStreak: number; 
    longestWinStreak: number; 
    longestLossStreak: number;
    winStreakSeasons: string[];
    lossStreakSeasons: string[];
  }>();

  // Initialize tracking for all users
  for (const userStats of userStatsMap.values()) {
    userStreaks.set(userStats.userId, {
      currentWinStreak: 0,
      currentLossStreak: 0,
      longestWinStreak: 0,
      longestLossStreak: 0,
      winStreakSeasons: [],
      lossStreakSeasons: []
    });
  }

  // Process each season chronologically to track streaks
  const sortedLeagueIds = [...linkedLeagueIds].sort();
  
  for (const leagueId of sortedLeagueIds) {
    try {
      const league = await getLeagueInfo(leagueId);
      if (!league) continue;

      const rosters = await getLeagueRosters(leagueId);
      
      // Process season results to update streaks
      rosters.forEach(roster => {
        const userStreak = userStreaks.get(roster.owner_id);
        if (!userStreak) return;

        const wins = roster.settings?.wins || 0;
        const losses = roster.settings?.losses || 0;
        const winPercentage = wins + losses > 0 ? wins / (wins + losses) : 0;
        
        // Consider a "winning season" as > 50% win rate
        if (winPercentage > 0.5) {
          // Winning season
          userStreak.currentWinStreak++;
          userStreak.currentLossStreak = 0;
          userStreak.winStreakSeasons.push(league.season);
          userStreak.lossStreakSeasons = [];
          
          if (userStreak.currentWinStreak > userStreak.longestWinStreak) {
            userStreak.longestWinStreak = userStreak.currentWinStreak;
          }
        } else {
          // Losing season
          userStreak.currentLossStreak++;
          userStreak.currentWinStreak = 0;
          userStreak.lossStreakSeasons.push(league.season);
          userStreak.winStreakSeasons = [];
          
          if (userStreak.currentLossStreak > userStreak.longestLossStreak) {
            userStreak.longestLossStreak = userStreak.currentLossStreak;
          }
        }
      });
    } catch (error) {
      console.error(`Error processing streaks for league ${leagueId}:`, error);
    }
  }

  // Generate streak records
  for (const [userId, streak] of userStreaks) {
    const userStats = userStatsMap.get(userId);
    if (!userStats) continue;

    // Update user stats
    userStats.longestWinStreak = streak.longestWinStreak;
    userStats.longestLossStreak = streak.longestLossStreak;

    // Add win streak records
    if (streak.longestWinStreak >= 2) {
      records.push({
        type: 'winStreak',
        season: streak.winStreakSeasons[streak.winStreakSeasons.length - 1] || 'Multiple',
        userId,
        username: userStats.username,
        avatar: userStats.avatar,
        value: streak.longestWinStreak,
        description: `${userStats.username} had ${streak.longestWinStreak} consecutive winning seasons`,
        details: {
          streak: streak.longestWinStreak,
          record: `${streak.longestWinStreak} winning seasons`
        }
      });
    }

    // Add loss streak records
    if (streak.longestLossStreak >= 2) {
      records.push({
        type: 'lossStreak',
        season: streak.lossStreakSeasons[streak.lossStreakSeasons.length - 1] || 'Multiple',
        userId,
        username: userStats.username,
        avatar: userStats.avatar,
        value: streak.longestLossStreak,
        description: `${userStats.username} had ${streak.longestLossStreak} consecutive losing seasons`,
        details: {
          streak: streak.longestLossStreak,
          record: `${streak.longestLossStreak} losing seasons`
        }
      });
    }
  }
}

// Calculate derived statistics
async function calculateDerivedStats(
  userStatsMap: Map<string, EnhancedUserStats>,
  records: EnhancedHistoricalRecord[]
): Promise<void> {
  for (const userStats of userStatsMap.values()) {
    // Calculate win percentages
    const totalGames = userStats.totalWins + userStats.totalLosses + userStats.totalTies;
    if (totalGames > 0) {
      userStats.winPercentage = userStats.totalWins / totalGames;
    }
    
    const playoffGames = userStats.playoffWins + userStats.playoffLosses;
    if (playoffGames > 0) {
      userStats.playoffWinPercentage = userStats.playoffWins / playoffGames;
    }

    // Calculate averages
    if (totalGames > 0) {
      userStats.averagePointsPerGame = userStats.totalPoints / totalGames;
      userStats.averagePointsAgainst = userStats.totalPointsAgainst / totalGames;
    }

    if (userStats.seasonsPlayed > 0) {
      userStats.pointsPerSeasonAverage = userStats.totalPoints / userStats.seasonsPlayed;
      
      // Calculate average finish
      const finishes = Object.values(userStats.seasonBySeasonStats).map(s => s.finish).filter(f => f > 0);
      if (finishes.length > 0) {
        userStats.averageFinish = finishes.reduce((a, b) => a + b, 0) / finishes.length;
      }
    }

    // Calculate consistency score (coefficient of variation)
    const seasonScores = Object.values(userStats.seasonBySeasonStats).map(s => s.pointsFor).filter(p => p > 0);
    if (seasonScores.length > 1) {
      const mean = seasonScores.reduce((a, b) => a + b, 0) / seasonScores.length;
      const variance = seasonScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / seasonScores.length;
      const stdDev = Math.sqrt(variance);
      userStats.consistencyScore = mean > 0 ? stdDev / mean : 0;
    }
  }
}

// Assign contextual rankings to records and limit to top 10 per category
function assignRecordRankings(records: EnhancedHistoricalRecord[]): void {
  const recordsByType = new Map<string, EnhancedHistoricalRecord[]>();
  
  // Group records by type
  records.forEach(record => {
    if (!recordsByType.has(record.type)) {
      recordsByType.set(record.type, []);
    }
    recordsByType.get(record.type)!.push(record);
  });

  // Sort and rank each type, keeping only top 10
  recordsByType.forEach((typeRecords, type) => {
    // Sort based on record type
    typeRecords.sort((a, b) => {
      if (type === 'lowScore' || type === 'playoffLowScore' || type === 'closeGame') {
        return a.value - b.value; // Lower is better
      }
      return b.value - a.value; // Higher is better
    });

    // Take only top 10 and assign rankings
    const top10 = typeRecords.slice(0, 10);
    top10.forEach((record, index) => {
      record.contextualRank = index + 1;
    });
    
    // Update the map with only top 10
    recordsByType.set(type, top10);
  });

  // Clear the original records array and populate with ranked top 10s
  records.length = 0;
  recordsByType.forEach(typeRecords => {
    records.push(...typeRecords);
  });
}

// Calculate league metadata
function calculateLeagueMetadata(
  linkedLeagueIds: string[],
  userStatsMap: Map<string, EnhancedUserStats>,
  seasonStats: { [season: string]: any }
): any {
  const allUsers = Array.from(userStatsMap.values());
  const seasons = Object.keys(seasonStats).sort();
  
  // Debug championship counts
  const championshipCounts = allUsers.map(u => u.championships);
  const maxChampionships = Math.max(...championshipCounts);
  console.log(`Championship counts: [${championshipCounts.join(', ')}], Max: ${maxChampionships}`);
  
  return {
    totalSeasons: seasons.length,
    currentSeason: seasons[seasons.length - 1],
    linkedLeagueIds,
    foundationYear: seasons[0],
    allTimeHighScore: Math.max(...allUsers.map(u => u.highestScore)),
    allTimeLowScore: Math.min(...allUsers.map(u => u.lowestScore).filter(s => s < Infinity)),
    mostChampionships: maxChampionships,
    averageLeagueScore: allUsers.reduce((sum, u) => sum + u.averagePointsPerGame, 0) / allUsers.length,
    totalGamesPlayed: allUsers.reduce((sum, u) => sum + u.totalWins + u.totalLosses + u.totalTies, 0) / 2 // Divide by 2 since each game involves 2 players
  };
}

// Helper function for ordinal suffixes
function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

// Export utility functions for use in components
export {
  findUserByRoster,
  getOrdinalSuffix
};