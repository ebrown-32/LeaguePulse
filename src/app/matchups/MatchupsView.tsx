'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { getLeagueInfo, getLeagueRosters, getLeagueUsers, getLeagueMatchups, getNFLState, getAllLeagueSeasons, getAllLinkedLeagueIds } from '@/lib/api';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/Select';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { getDefaultSeason } from '@/lib/utils';
import type { SleeperMatchup } from '@/types/sleeper';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Flame, Trophy } from 'lucide-react';

interface MatchupsViewProps {
  currentWeek?: number;
}

export default function MatchupsView({ currentWeek: initialWeek }: MatchupsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(initialWeek || 1);
  const [nflState, setNFLState] = useState<any>(null);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [seasonRosters, setSeasonRosters] = useState<any[]>([]);
  const [loadingSeasonData, setLoadingSeasonData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }

      try {
        const leagueId = await getCurrentLeagueId();

        const [leagueData, allSeasons] = await Promise.all([
          getLeagueInfo(leagueId),
          getAllLeagueSeasons(leagueId),
        ]);

        const defaultSeason = getDefaultSeason(allSeasons, leagueData.draft_id);

        const [usersData, rostersData, nflStateData] = await Promise.all([
          getLeagueUsers(leagueId),
          getLeagueRosters(leagueId),
          getNFLState(),
        ]);

        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNFLState(nflStateData);
        setSeasons(allSeasons);
        setSelectedSeason(defaultSeason);
        setSeasonRosters(rostersData);

        if (!initialWeek) {
          const currentWeek = nflStateData?.season_type === 'regular'
            ? nflStateData.week
            : 1;
          setSelectedWeek(leagueData.status === 'in_season' ? currentWeek : 1);
        }

        const matchupsData = await getLeagueMatchups(leagueId, selectedWeek);
        setMatchups(matchupsData);

      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch league data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [initialWeek]);

  useEffect(() => {
    const fetchSeasonData = async () => {
      if (!selectedSeason || !league) return;

      setLoadingSeasonData(true);
      try {
        const linkedLeagues = await getAllLinkedLeagueIds(league.league_id);

        const seasonLeagueId = await (async () => {
          for (const leagueId of linkedLeagues) {
            const leagueInfo = await getLeagueInfo(leagueId);
            if (leagueInfo.season === selectedSeason) {
              return leagueId;
            }
          }
          return league.league_id;
        })();

        const [seasonRostersData, matchupsData] = await Promise.all([
          getLeagueRosters(seasonLeagueId),
          getLeagueMatchups(seasonLeagueId, selectedWeek)
        ]);

        setSeasonRosters(seasonRostersData);
        setMatchups(matchupsData);
      } catch (error) {
        console.error('Failed to fetch season data:', error);
        setSeasonRosters(rosters);
      } finally {
        setLoadingSeasonData(false);
      }
    };

    fetchSeasonData();
  }, [selectedSeason, selectedWeek, league, rosters]);

  if (loading) return <LoadingPage />;
  if (error) return <ErrorMessage title="Error" message={error} />;
  if (!league || !users.length || !rosters.length) return null;

  const groupedMatchups = matchups.reduce((acc, matchup) => {
    if (!matchup.matchup_id) return acc;
    if (!acc[matchup.matchup_id]) acc[matchup.matchup_id] = [];
    acc[matchup.matchup_id].push(matchup);
    return acc;
  }, {} as Record<string, any[]>);

  const sortedGroupedMatchups = Object.entries(groupedMatchups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, any[]>);

  const finalGroupedMatchups = sortedGroupedMatchups;

  const getMatchupContext = () => {
    const isPlayoffs = selectedWeek >= (league?.settings?.playoff_week_start || 15);
    const isCurrentWeek = selectedWeek === nflState?.week && selectedSeason === league?.season;

    if (isPlayoffs) {
      return {
        title: `Week ${selectedWeek}: Playoffs`,
        subtitle: isCurrentWeek ? 'Championship dreams on the line' : 'Playoff battles.',
      };
    }

    return {
      title: `Week ${selectedWeek}: Regular Season`,
      subtitle: isCurrentWeek ? "This week's matchups" : 'Head-to-head battles.',
    };
  };

  const context = getMatchupContext();
  const hasMatchups = Object.keys(finalGroupedMatchups).length > 0;
  const isPlayoffWeek = selectedWeek >= (league?.settings?.playoff_week_start || 15);

  return (
    <div className="space-y-6">
      {/* Week Control Bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 md:p-5"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            {isPlayoffWeek ? (
              <Trophy className="h-5 w-5 text-primary" />
            ) : (
              <Flame className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground md:text-xl">{context.title}</h2>
            <p className="text-sm text-muted-foreground">{context.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SeasonSelect
            seasons={seasons}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            className="w-full sm:w-[140px]"
          />
          <Select
            value={selectedWeek.toString()}
            onValueChange={(value) => setSelectedWeek(Number(value))}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              Week {selectedWeek}
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 18 }, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  Week {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
              disabled={selectedWeek <= 1}
              className="rounded-lg border border-border p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSelectedWeek(Math.min(18, selectedWeek + 1))}
              disabled={selectedWeek >= 18}
              className="rounded-lg border border-border p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {hasMatchups && (
            <span className="text-xs text-muted-foreground">
              {Object.keys(groupedMatchups).length} matchups
            </span>
          )}
        </div>
      </motion.div>

      {/* Matchups Content */}
      {loadingSeasonData ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !hasMatchups ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="text-muted-foreground">
              <Flame className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No Matchups Available</h3>
              <p className="text-sm">There are no matchups for Week {selectedWeek} in Season {selectedSeason}.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          className="grid gap-4 md:gap-5 lg:grid-cols-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {Object.values(finalGroupedMatchups).map((matchup, index) => {
            const [team1, team2] = matchup;
            if (!team1 || !team2) return null;

            const roster1 = seasonRosters.find((r) => r.roster_id === team1.roster_id);
            const roster2 = seasonRosters.find((r) => r.roster_id === team2.roster_id);
            const user1 = users.find((u) => u.user_id === roster1?.owner_id);
            const user2 = users.find((u) => u.user_id === roster2?.owner_id);

            if (!roster1 || !roster2 || !user1 || !user2) return null;

            const team1Points = team1.points || 0;
            const team2Points = team2.points || 0;
            const matchupComplete = team1.points !== null && team2.points !== null && (team1Points > 0 || team2Points > 0);
            const team1Winning = team1Points > team2Points;
            const team2Winning = team2Points > team1Points;
            const isTie = matchupComplete && team1Points === team2Points;
            const totalPoints = team1Points + team2Points;
            const pointDifference = Math.abs(team1Points - team2Points);
            const isCloseGame = matchupComplete && pointDifference < 5;
            const isHighScoring = totalPoints > 200;

            return (
              <motion.div
                key={team1.matchup_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className={`overflow-hidden transition-shadow duration-300 hover:shadow-md ${
                  isCloseGame ? 'ring-1 ring-amber-500/30' :
                  isHighScoring ? 'ring-1 ring-primary/30' : ''
                }`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {isPlayoffWeek ? 'Playoff Match' : 'Matchup'}
                        </h3>
                        {matchupComplete && (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            Final
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isCloseGame && (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Flame className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide">Close</span>
                          </div>
                        )}
                        {isHighScoring && (
                          <div className="flex items-center gap-1 text-primary">
                            <Trophy className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide">High Score</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="space-y-px">
                      {/* Team 1 */}
                      <div className={`flex items-center justify-between p-4 md:p-5 transition-colors duration-200 ${
                        matchupComplete && team1Winning
                          ? 'bg-primary/[0.04] border-l-4 border-primary'
                          : isTie && matchupComplete
                          ? 'bg-amber-500/[0.04] border-l-4 border-amber-500'
                          : 'border-l-4 border-transparent hover:bg-accent/40'
                      }`}>
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                          <Avatar
                            avatarId={user1.avatar}
                            size={40}
                            className={`md:w-11 md:h-11 rounded-lg ${
                              matchupComplete && team1Winning ? 'ring-2 ring-primary' : 'ring-1 ring-border'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm md:text-base truncate ${
                              matchupComplete && team1Winning ? 'text-primary' : 'text-foreground'
                            }`}>
                              {user1.metadata?.team_name || user1.display_name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{roster1.settings.wins || 0}-{roster1.settings.losses || 0}{roster1.settings.ties > 0 ? `-${roster1.settings.ties}` : ''}</span>
                              <span className="hidden sm:inline">·</span>
                              <span className="hidden sm:inline">{(((roster1.settings?.fpts || 0) + (roster1.settings?.fpts_decimal || 0) / 100) / Math.max(1, (roster1.settings?.wins || 0) + (roster1.settings?.losses || 0) + (roster1.settings?.ties || 0))).toFixed(1)} avg</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-display text-2xl md:text-3xl font-bold tabular-nums ${
                            matchupComplete && team1Winning
                              ? 'text-primary'
                              : isTie && matchupComplete
                              ? 'text-amber-500'
                              : 'text-foreground'
                          }`}>
                            {team1Points?.toFixed(1) || '0.0'}
                          </div>
                          {matchupComplete && team1Winning && (
                            <div className="text-xs text-primary font-semibold">
                              +{pointDifference.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* VS Divider */}
                      <div className="relative py-1.5">
                        <div className="absolute inset-0 flex items-center px-4">
                          <div className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-background px-3 text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                            {matchupComplete ? (isTie ? 'TIE' : 'FINAL') : 'VS'}
                          </span>
                        </div>
                      </div>

                      {/* Team 2 */}
                      <div className={`flex items-center justify-between p-4 md:p-5 transition-colors duration-200 ${
                        matchupComplete && team2Winning
                          ? 'bg-primary/[0.04] border-l-4 border-primary'
                          : isTie && matchupComplete
                          ? 'bg-amber-500/[0.04] border-l-4 border-amber-500'
                          : 'border-l-4 border-transparent hover:bg-accent/40'
                      }`}>
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                          <Avatar
                            avatarId={user2.avatar}
                            size={40}
                            className={`md:w-11 md:h-11 rounded-lg ${
                              matchupComplete && team2Winning ? 'ring-2 ring-primary' : 'ring-1 ring-border'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`font-semibold text-sm md:text-base truncate ${
                              matchupComplete && team2Winning ? 'text-primary' : 'text-foreground'
                            }`}>
                              {user2.metadata?.team_name || user2.display_name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{roster2.settings.wins || 0}-{roster2.settings.losses || 0}{roster2.settings.ties > 0 ? `-${roster2.settings.ties}` : ''}</span>
                              <span className="hidden sm:inline">·</span>
                              <span className="hidden sm:inline">{(((roster2.settings?.fpts || 0) + (roster2.settings?.fpts_decimal || 0) / 100) / Math.max(1, (roster2.settings?.wins || 0) + (roster2.settings?.losses || 0) + (roster2.settings?.ties || 0))).toFixed(1)} avg</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-display text-2xl md:text-3xl font-bold tabular-nums ${
                            matchupComplete && team2Winning
                              ? 'text-primary'
                              : isTie && matchupComplete
                              ? 'text-amber-500'
                              : 'text-foreground'
                          }`}>
                            {team2Points?.toFixed(1) || '0.0'}
                          </div>
                          {matchupComplete && team2Winning && (
                            <div className="text-xs text-primary font-semibold">
                              +{pointDifference.toFixed(1)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Matchup Summary */}
                    {matchupComplete && (
                      <div className="px-4 py-3 md:px-5 bg-muted/40 border-t border-border">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Total: <span className="font-semibold text-foreground">{totalPoints.toFixed(1)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Margin: <span className="font-semibold text-foreground">{pointDifference.toFixed(1)}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
