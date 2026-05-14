'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  getLeagueInfo,
  getLeagueRosters,
  getLeagueUsers,
  getNFLState,
  getAllLeagueSeasons,
  getAllLinkedLeagueIds,
  getLeagueMatchups,
  generateComprehensiveLeagueHistory,
} from '@/lib/api';
import {
  Trophy,
  BarChart3,
  Users,
  User,
  LayoutDashboard,
  Flame,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import TransactionTicker from '@/components/ui/TransactionTicker';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import {
  getDefaultSeason,
  getDefaultValue,
  formatPoints,
  calculateWinPercentage,
  formatRecord,
} from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Profanity filter ────────────────────────────────────────────────────────

const PROFANITY_LIST = new Set([
  'fuck','fuckin','fucking','fucker','fucked','fucks',
  'shit','shitty','shitting','bullshit',
  'cunt','cunts',
  'bitch','bitches','bitchin',
  'cock','cocks',
  'dick','dicks',
  'pussy','pussies',
  'asshole','assholes','arsehole',
  'whore','whores',
  'nigger','niggers','nigga','niggas',
  'faggot','faggots','fag','fags',
  'retard','retarded','retards',
  'bastard','bastards',
]);

function censorWord(word: string): string {
  if (word.length <= 2) return '***';
  return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
}

function censorTeamName(name: string): string {
  if (!name) return name;
  return name.replace(/\b\w+\b/g, (match) =>
    PROFANITY_LIST.has(match.toLowerCase()) ? censorWord(match) : match
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function calculateHistoricalInsights(seasons: string[], currentLeagueId: string) {
  try {
    const linkedLeagues = await getAllLinkedLeagueIds(currentLeagueId);
    const historyData   = await generateComprehensiveLeagueHistory(linkedLeagues);
    const totalTeams    = historyData.seasonAnalyses.reduce((s: number, season: any) => s + season.rosters.length, 0);
    const uniqueChampions = new Set<string>();
    historyData.seasonAnalyses.forEach((season: any) =>
      season.champions.forEach((c: any) => uniqueChampions.add(c.owner_id)),
    );
    return {
      totalSeasons:          historyData.allTimeStats.totalSeasons,
      totalTeams,
      totalGames:            historyData.allTimeStats.totalGames,
      champions:             historyData.records.filter((r: any) => r.type === 'championship'),
      uniqueChampionsCount:  uniqueChampions.size,
      highestScore:          historyData.allTimeStats.highestScore,
      lowestScore:           historyData.allTimeStats.lowestScore,
      averageScore:          historyData.allTimeStats.averageScore,
      totalPoints:           historyData.allTimeStats.totalPoints,
      seasonAnalyses:        historyData.seasonAnalyses,
    };
  } catch {
    return { totalSeasons: seasons.length, totalTeams: 0, totalGames: 0, champions: [], uniqueChampionsCount: 0, highestScore: 0, lowestScore: 0, averageScore: 0, totalPoints: 0, seasonAnalyses: [] };
  }
}

function getEffectiveLeagueStatus(league: any, nflState: any): string {
  if (['in_season', 'post_season', 'complete'].includes(league.status)) return league.status;
  if (league.status === 'drafting') return 'drafting';
  if (league.status === 'pre_draft' && league.draft_id && nflState?.week === 0) return 'preseason';
  if (league.status === 'pre_draft' && league.draft_id && nflState?.week >= 1) return 'in_season';
  return 'pre_draft';
}

function formatLeagueStatus(status: string): string {
  const map: Record<string, string> = { pre_draft: 'Pre-Draft', drafting: 'Drafting', preseason: 'Preseason', in_season: 'In Season', post_season: 'Postseason', complete: 'Complete' };
  return map[status] ?? 'Unknown';
}

function formatDraftDate(draftId: string | null): string {
  if (!draftId) return 'Not set';
  try { const d = new Date(Number(draftId)); return !isNaN(d.getTime()) ? d.toLocaleDateString() : 'Not set'; }
  catch { return 'Not set'; }
}

function formatWeekDisplay(status: string, week: number | null): string {
  switch (status) {
    case 'drafting':    return 'Draft Week';
    case 'preseason':   return 'Preseason';
    case 'in_season':
    case 'post_season': return `Week ${getDefaultValue(week, 0)}`;
    default:            return '—';
  }
}

function getLeagueSubtitle(league: any, nflState: any, seasons: string[], historyData: any): string {
  const currentSeason = nflState?.season ?? league?.season ?? new Date().getFullYear().toString();
  if (historyData?.totalSeasons > 1) return `Season ${currentSeason}, ${historyData.totalSeasons} seasons of competition.`;
  return `Season ${currentSeason} · ${new Date().toLocaleDateString()}`;
}

function getSeasonContext(league: any, nflState: any): string | null {
  switch (getEffectiveLeagueStatus(league, nflState)) {
    case 'pre_draft':   return league.draft_id ? `Draft: ${formatDraftDate(league.draft_id)}` : 'Draft not scheduled.';
    case 'drafting':    return 'Draft in progress.';
    case 'preseason':   return 'Season starting soon.';
    case 'in_season':   return 'Regular season active.';
    case 'post_season': return 'Playoffs underway.';
    case 'complete':    return 'Season completed.';
    default:            return null;
  }
}

function getWeekContext(league: any, nflState: any): string {
  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
  const week = nflState?.week ?? 0;
  if (effectiveStatus === 'in_season' || effectiveStatus === 'post_season') {
    return week >= (league.settings?.playoff_week_start ?? 15) ? 'Playoffs' : 'Regular Season';
  }
  return '';
}

function getHighlightMatchups(matchups: any[], rosters: any[], users: any[]): any[] {
  if (!matchups?.length) return [];
  const grouped = matchups.reduce((acc: any, m: any) => {
    if (!m.matchup_id) return acc;
    acc[m.matchup_id] = acc[m.matchup_id] ?? [];
    acc[m.matchup_id].push(m);
    return acc;
  }, {});
  return (Object.values(grouped) as any[][]).map((pair) => {
    const [t1, t2] = pair;
    if (!t1 || !t2) return null;
    const r1 = rosters.find((r: any) => r.roster_id === t1.roster_id);
    const r2 = rosters.find((r: any) => r.roster_id === t2.roster_id);
    const u1 = users.find((u: any) => u.user_id === r1?.owner_id);
    const u2 = users.find((u: any) => u.user_id === r2?.owner_id);
    if (!r1 || !r2 || !u1 || !u2) return null;
    const p1 = t1.points ?? 0, p2 = t2.points ?? 0;
    return { id: t1.matchup_id, team1: { name: censorTeamName(u1.metadata?.team_name || u1.display_name), avatar: u1.avatar, points: p1 }, team2: { name: censorTeamName(u2.metadata?.team_name || u2.display_name), avatar: u2.avatar, points: p2 }, isHighlight: p1 + p2 > 200 || (Math.abs(p1 - p2) < 10 && p1 + p2 > 0), totalPoints: p1 + p2 };
  }).filter(Boolean).sort((a: any, b: any) => { if (a.isHighlight !== b.isHighlight) return a.isHighlight ? -1 : 1; return b.totalPoints - a.totalPoints; }).slice(0, 6);
}

// ─── Stat card component ─────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-none group min-w-[158px] md:min-w-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          {label}
        </p>
        <p className="font-display text-lg font-bold text-foreground leading-tight">
          {value}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [league,           setLeague]           = useState<any>(null);
  const [users,            setUsers]            = useState<any[]>([]);
  const [rosters,          setRosters]          = useState<any[]>([]);
  const [nflState,         setNFLState]         = useState<any>(null);
  const [seasons,          setSeasons]          = useState<string[]>([]);
  const [selectedSeason,   setSelectedSeason]   = useState('');
  const [seasonRosters,    setSeasonRosters]    = useState<any[]>([]);
  const [loadingSeasonData,setLoadingSeasonData]= useState(false);
  const [historyData,      setHistoryData]      = useState<any>(null);
  const [currentWeekMatchups, setCurrentWeekMatchups] = useState<any[]>([]);
  const [allTimeUserStats, setAllTimeUserStats] = useState<any>(null);

  const effectiveWeek = nflState?.season_type === 'regular' ? nflState.week : 1;

  useEffect(() => {
    const fetchData = async () => {
      if (!INITIAL_LEAGUE_ID || INITIAL_LEAGUE_ID === 'YOUR_LEAGUE_ID') {
        setError('Please set your Sleeper league ID in the .env.local file.');
        setLoading(false);
        return;
      }
      try {
        const leagueId = await getCurrentLeagueId();
        const [leagueData, allSeasons] = await Promise.all([getLeagueInfo(leagueId), getAllLeagueSeasons(leagueId)]);
        const defaultSeason = getDefaultSeason(allSeasons, leagueData.draft_id);
        const [usersData, rostersData, nflStateData] = await Promise.all([getLeagueUsers(leagueId), getLeagueRosters(leagueId), getNFLState()]);

        let matchupsData: any[] = [];
        const ew = nflStateData?.season_type === 'regular' ? nflStateData.week : 1;
        if (ew && leagueData.status === 'in_season') {
          try { matchupsData = await getLeagueMatchups(leagueId, ew); } catch {}
        }

        const history = await calculateHistoricalInsights(allSeasons, leagueId);
        setLeague(leagueData); setUsers(usersData); setRosters(rostersData);
        setNFLState(nflStateData); setSeasons(allSeasons); setSelectedSeason(defaultSeason);
        setSeasonRosters(rostersData); setCurrentWeekMatchups(matchupsData); setHistoryData(history);

        if (history?.seasonAnalyses?.length > 1) {
          const linked = await getAllLinkedLeagueIds(leagueId);
          const comp   = await generateComprehensiveLeagueHistory(linked);
          setAllTimeUserStats(comp.userAllTimeStats);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch league data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchSeasonRosters = async () => {
      if (!selectedSeason || !league || selectedSeason === 'all-time') { setLoadingSeasonData(false); return; }
      setLoadingSeasonData(true);
      try {
        const linked = await getAllLinkedLeagueIds(league.league_id);
        let seasonLeagueId = league.league_id;
        for (const id of linked) {
          const info = await getLeagueInfo(id);
          if (info.season === selectedSeason) { seasonLeagueId = id; break; }
        }
        setSeasonRosters(await getLeagueRosters(seasonLeagueId));
      } catch { setSeasonRosters(rosters); }
      finally   { setLoadingSeasonData(false); }
    };
    fetchSeasonRosters();
  }, [selectedSeason, league, rosters]);

  if (loading) return <LoadingPage />;
  if (error)   return <ErrorMessage title="Error" message={error} />;
  if (!league || !users.length || !rosters.length) return null;

  const commissioner = users.find((u: any) => u.is_owner);

  const sortedRosters = [...seasonRosters].sort((a: any, b: any) => {
    const bw = getDefaultValue(b.settings?.wins, 0), aw = getDefaultValue(a.settings?.wins, 0);
    if (bw !== aw) return bw - aw;
    return (getDefaultValue(b.settings?.fpts, 0) + getDefaultValue(b.settings?.fpts_decimal, 0) / 100)
         - (getDefaultValue(a.settings?.fpts, 0) + getDefaultValue(a.settings?.fpts_decimal, 0) / 100);
  });

  const allTimeStandings = selectedSeason === 'all-time' && allTimeUserStats
    ? Object.entries(allTimeUserStats)
        .map(([userId, s]: any) => ({ user: users.find((u: any) => u.user_id === userId), userId, ...s }))
        .filter((x: any) => x.user)
        .sort((a: any, b: any) => {
          if (Math.abs(b.winPercentage - a.winPercentage) > 0.001) return b.winPercentage - a.winPercentage;
          if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
          return b.championships - a.championships;
        })
    : [];

  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
  const playoffTeams    = getDefaultValue(league.settings?.playoff_teams, 6);

  return (
    <PageLayout
      title={league.name}
      subtitle={getLeagueSubtitle(league, nflState, seasons, historyData)}
      icon={<LayoutDashboard className="h-5 w-5" />}
      action={commissioner && (
        <div className="hidden md:flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Commissioner:</span>
          <span className="font-medium text-foreground">{commissioner.display_name}</span>
        </div>
      )}
    >
      <div className="space-y-8">

        {/* ── Stat cards: snap-scroll on mobile, grid on md+ ── */}
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
          {[
            { icon: Clock,    label: 'Season Status', value: formatLeagueStatus(effectiveStatus),     sub: getSeasonContext(league, nflState) },
            { icon: Users,    label: 'League Size',   value: `${league.total_rosters} Teams`,         sub: league.scoring_settings?.rec ? 'PPR Scoring' : 'Standard Scoring' },
            { icon: BarChart3,label: 'Current Week',  value: formatWeekDisplay(effectiveStatus, effectiveWeek), sub: getWeekContext(league, nflState) || undefined },
            { icon: Sparkles, label: 'Playoff Race',  value: `${playoffTeams} Spots`,                 sub: `Starts week ${league.settings?.playoff_week_start ?? 15}` },
          ].map(({ icon, label, value, sub }) => (
            <div key={label} className="snap-start shrink-0 w-[calc(50vw-1.25rem)] sm:w-auto md:w-auto">
              <StatCard icon={icon} label={label} value={value} sub={sub} />
            </div>
          ))}
        </div>

        {/* ── Transaction ticker ── */}
        <TransactionTicker />

        {/* ── This Week&apos;s Battles ── */}
        {league.status === 'in_season' && currentWeekMatchups.length > 0 && (
          <div>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <CardTitle>This Week&apos;s Battles</CardTitle>
                </div>
                <span className="rounded border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Week {effectiveWeek}
                </span>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {getHighlightMatchups(currentWeekMatchups, seasonRosters, users).map((matchup: any) => {
                    const p1 = matchup.team1.points ?? 0;
                    const p2 = matchup.team2.points ?? 0;
                    const hasScores = p1 + p2 > 0;
                    const t1Winning = hasScores && p1 > p2;
                    const t2Winning = hasScores && p2 > p1;
                    return (
                      <div
                        key={matchup.id}
                        className="relative rounded-xl border border-border bg-background overflow-hidden"
                      >
                        {matchup.isHighlight && (
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
                        )}

                        {/* Team 1 */}
                        <div className={cn(
                          'flex items-center gap-3 px-4 py-3.5',
                          t1Winning && 'bg-primary/[0.04]',
                        )}>
                          <Avatar avatarId={matchup.team1.avatar} size={30} className="rounded-lg shrink-0" />
                          <span className={cn(
                            'flex-1 text-sm font-medium leading-tight',
                            t1Winning ? 'text-foreground font-semibold' : 'text-muted-foreground',
                          )}>
                            {matchup.team1.name}
                          </span>
                          <span className={cn(
                            'font-display text-xl font-bold tabular-nums shrink-0',
                            t1Winning ? 'text-primary' : 'text-muted-foreground',
                          )}>
                            {p1.toFixed(1)}
                          </span>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center px-4">
                          <div className="flex-1 h-px bg-border/60" />
                          <span className="px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">vs</span>
                          <div className="flex-1 h-px bg-border/60" />
                        </div>

                        {/* Team 2 */}
                        <div className={cn(
                          'flex items-center gap-3 px-4 py-3.5',
                          t2Winning && 'bg-primary/[0.04]',
                        )}>
                          <Avatar avatarId={matchup.team2.avatar} size={30} className="rounded-lg shrink-0" />
                          <span className={cn(
                            'flex-1 text-sm font-medium leading-tight',
                            t2Winning ? 'text-foreground font-semibold' : 'text-muted-foreground',
                          )}>
                            {matchup.team2.name}
                          </span>
                          <span className={cn(
                            'font-display text-xl font-bold tabular-nums shrink-0',
                            t2Winning ? 'text-primary' : 'text-muted-foreground',
                          )}>
                            {p2.toFixed(1)}
                          </span>
                        </div>

                        {matchup.isHighlight && (
                          <div className="absolute top-3 right-3">
                            <Flame className="h-3.5 w-3.5 text-orange-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Standings ── */}
        <div>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <CardTitle>Standings</CardTitle>
              </div>
              <SeasonSelect
                seasons={seasons}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
                className="w-[130px]"
              />
            </CardHeader>
            <CardContent>
              {loadingSeasonData ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="space-y-0.5">
                  {/* Column headers */}
                  <div className="hidden md:flex items-center gap-3 py-2 px-4 mb-1">
                    <span className="w-5 shrink-0" />
                    <span className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Team</span>
                    <span className="w-20 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Record</span>
                    <span className="w-14 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Win%</span>
                    <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">PF</span>
                    <span className="w-16 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">PA</span>
                  </div>

                  {/* All-time standings */}
                  {selectedSeason === 'all-time'
                    ? allTimeStandings.map((s: any, i: number) => {
                        const totalGames = s.totalWins + s.totalLosses + s.totalTies;
                        const avgPF = totalGames > 0 ? s.totalPoints / totalGames : 0;
                        return (
                          <div
                            key={s.userId}
                            className={cn(
                              'relative flex items-center gap-3 rounded-md px-4 py-3 border-l-2 transition-none group',
                              i === 0
                                ? 'border-amber-400 bg-amber-500/[0.05] hover:bg-amber-500/[0.08]'
                                : 'border-transparent hover:bg-accent/60',
                            )}
                          >
                            <span className={cn(
                              'w-5 shrink-0 text-center text-xs font-bold',
                              i === 0 ? 'text-amber-500' : 'text-muted-foreground',
                            )}>
                              {i + 1}
                            </span>
                            <Avatar avatarId={s.user.avatar} size={26} className="rounded shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                                  {censorTeamName(s.user.display_name)}
                                </span>
                                {s.championships > 0 && (
                                  <span className={cn(
                                    'hidden md:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border',
                                    i === 0
                                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                      : 'bg-primary/10 text-primary border-primary/20',
                                  )}>
                                    {s.championships}× Champ
                                  </span>
                                )}
                              </div>
                              {/* Mobile sub-stats */}
                              <div className="mt-0.5 flex items-center gap-1.5 md:hidden">
                                <span className="text-[10px] text-muted-foreground">{s.winPercentage.toFixed(1)}% win</span>
                                <span className="text-[10px] text-muted-foreground/40">·</span>
                                <span className="text-[10px] text-muted-foreground">{formatPoints(avgPF)} avg</span>
                                {s.championships > 0 && (
                                  <>
                                    <span className="text-[10px] text-muted-foreground/40">·</span>
                                    <span className={cn('text-[10px] font-semibold', i === 0 ? 'text-amber-500' : 'text-primary')}>
                                      {s.championships}× Champ
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="hidden md:flex items-center gap-3 shrink-0">
                              <span className="w-20 text-right font-mono text-sm text-foreground">
                                {s.totalWins}-{s.totalLosses}{s.totalTies > 0 ? `-${s.totalTies}` : ''}
                              </span>
                              <span className="w-14 text-right text-sm text-muted-foreground">
                                {s.winPercentage.toFixed(1)}%
                              </span>
                              <span className="w-16 text-right text-sm font-medium text-foreground">
                                {formatPoints(avgPF)}
                              </span>
                              <span className="w-16 text-right text-sm text-muted-foreground">
                                {formatPoints(totalGames > 0 ? s.totalPointsAgainst / totalGames : 0)}
                              </span>
                            </div>
                            {/* Mobile record */}
                            <div className="md:hidden text-right shrink-0">
                              <p className="text-xs font-mono font-semibold text-foreground">{s.totalWins}-{s.totalLosses}</p>
                            </div>
                          </div>
                        );
                      })

                    /* Season standings */
                    : sortedRosters.map((roster: any, i: number) => {
                        const user = users.find((u: any) => u.user_id === roster.owner_id);
                        if (!user) return null;
                        const wins       = getDefaultValue(roster.settings?.wins, 0);
                        const losses     = getDefaultValue(roster.settings?.losses, 0);
                        const ties       = getDefaultValue(roster.settings?.ties, 0);
                        const fpts       = getDefaultValue(roster.settings?.fpts, 0) + getDefaultValue(roster.settings?.fpts_decimal, 0) / 100;
                        const fptsAgainst= getDefaultValue(roster.settings?.fpts_against, 0) + getDefaultValue(roster.settings?.fpts_against_decimal, 0) / 100;
                        const winPct     = calculateWinPercentage(wins, losses, ties);
                        const isPlayoff  = i < playoffTeams;
                        const isBubble   = i === playoffTeams;

                        return (
                          <div
                            key={roster.roster_id}
                            className={cn(
                              'relative flex items-center gap-3 rounded-md px-4 py-3 border-l-2 transition-none',
                              isPlayoff
                                ? 'border-primary bg-primary/[0.04] hover:bg-primary/[0.07]'
                                : isBubble
                                  ? 'border-primary/40 bg-primary/[0.02] hover:bg-primary/[0.04]'
                                  : 'border-transparent hover:bg-accent/60',
                            )}
                          >
                            <span className={cn(
                              'w-5 shrink-0 text-center text-xs font-bold',
                              isPlayoff ? 'text-primary' : isBubble ? 'text-primary/50' : 'text-muted-foreground',
                            )}>
                              {i + 1}
                            </span>
                            <Avatar avatarId={user.avatar} size={26} className="rounded shrink-0" />

                            {/* Team name + inline badge */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                                  {censorTeamName(user.metadata?.team_name || user.display_name)}
                                </span>
                                {isPlayoff && (
                                  <span className="hidden md:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-primary/10 text-primary border border-primary/20">
                                    Playoff
                                  </span>
                                )}
                                {isBubble && (
                                  <span className="hidden md:inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-primary/[0.08] text-primary/60 border border-primary/20">
                                    Bubble
                                  </span>
                                )}
                              </div>
                              {/* Mobile sub-stats */}
                              <div className="mt-0.5 flex items-center gap-1.5 md:hidden">
                                <span className="text-[10px] text-muted-foreground">{winPct.toFixed(1)}% win</span>
                                <span className="text-[10px] text-muted-foreground/40">·</span>
                                <span className="text-[10px] text-muted-foreground">{formatPoints(fpts)} PF</span>
                                {(isPlayoff || isBubble) && (
                                  <>
                                    <span className="text-[10px] text-muted-foreground/40">·</span>
                                    <span className={cn('text-[10px] font-semibold', isPlayoff ? 'text-primary' : 'text-primary/50')}>
                                      {isPlayoff ? 'Playoff' : 'Bubble'}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Desktop stats */}
                            <div className="hidden md:flex items-center gap-3 shrink-0">
                              <span className="w-20 text-right font-mono text-sm text-foreground">
                                {formatRecord(wins, losses, ties)}
                              </span>
                              <span className="w-14 text-right text-sm text-muted-foreground">
                                {winPct.toFixed(1)}%
                              </span>
                              <span className="w-16 text-right text-sm font-medium text-foreground">
                                {formatPoints(fpts)}
                              </span>
                              <span className="w-16 text-right text-sm text-muted-foreground">
                                {formatPoints(fptsAgainst)}
                              </span>
                            </div>

                            {/* Mobile record */}
                            <div className="md:hidden text-right shrink-0">
                              <p className="text-xs font-mono font-semibold text-foreground">{formatRecord(wins, losses, ties)}</p>
                            </div>
                          </div>
                        );
                      })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
