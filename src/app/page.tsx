'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Avatar from '@/components/ui/Avatar';
import TeamLink from '@/components/ui/TeamLink';
import { PageLayout } from '@/components/layout/PageLayout';
import MatchupDetailModal, { type MatchupTarget } from '@/components/matchup/MatchupDetailModal';
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
  Home as HomeIcon,
  Flame,
  CalendarDays,
  Swords,
  Trophy,
  ArrowLeftRight,
  Receipt,
} from 'lucide-react';
import { INITIAL_LEAGUE_ID, getCurrentLeagueId } from '@/config/league';
import TransactionTicker from '@/components/ui/TransactionTicker';
import LeagueCarousel from '@/components/home/LeagueCarousel';
import TrophyCase from '@/components/home/TrophyCase';
import StandingsTable from '@/components/standings/StandingsTable';
import { allTimePointsAgainst } from '@/lib/allTimePointsAgainst';
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
    default:            return '-';
  }
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
    return { id: t1.matchup_id, team1: { userId: u1.user_id, name: censorTeamName(u1.metadata?.team_name || u1.display_name), avatar: u1.avatar, points: p1 }, team2: { userId: u2.user_id, name: censorTeamName(u2.metadata?.team_name || u2.display_name), avatar: u2.avatar, points: p2 }, isHighlight: p1 + p2 > 200 || (Math.abs(p1 - p2) < 10 && p1 + p2 > 0), totalPoints: p1 + p2 };
  }).filter(Boolean).sort((a: any, b: any) => { if (a.isHighlight !== b.isHighlight) return a.isHighlight ? -1 : 1; return b.totalPoints - a.totalPoints; }).slice(0, 6);
}

// ─── Stat card component ─────────────────────────────────────────────────────

/** One metric in the thin "league at a glance" strip. */
/**
 * One headline number.
 *
 * These were four bare figures crammed into a bordered strip inside the hero,
 * where they read as an afterthought. As cards they carry their own weight and
 * there is room to say what each one means.
 */
function PulseStat({ label, value, sub, icon: Icon, href }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="mt-1.5 block font-display text-2xl font-bold tabular-nums leading-none text-foreground sm:text-3xl">
        {value}
      </span>
      {sub && <span className="mt-1 block text-[11px] text-muted-foreground">{sub}</span>}
    </>
  );

  const cls = 'lp-glass rounded-xl border p-3.5 transition-colors sm:p-4';
  return href
    ? <Link href={href} className={`${cls} hover:border-primary/40`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [league,           setLeague]           = useState<any>(null);
  const [users,            setUsers]            = useState<any[]>([]);
  const [rosters,          setRosters]          = useState<any[]>([]);
  const [nflState,         setNFLState]         = useState<any>(null);
  const [totals, setTotals] = useState<{
    totals: { trade: number; waiver: number; free_agent: number; total: number };
    bySeason: { season: string; trades: number; total: number }[];
  } | null>(null);
  const [seasons,          setSeasons]          = useState<string[]>([]);
  const [selectedSeason,   setSelectedSeason]   = useState('');
  const [seasonRosters,    setSeasonRosters]    = useState<any[]>([]);
  const [loadingSeasonData,setLoadingSeasonData]= useState(false);
  const [historyData,      setHistoryData]      = useState<any>(null);
  const [currentWeekMatchups, setCurrentWeekMatchups] = useState<any[]>([]);
  const [allTimeUserStats, setAllTimeUserStats] = useState<any>(null);
  const [paByUser, setPaByUser] = useState<Record<string, number>>({});
  const [openMatchup, setOpenMatchup] = useState<MatchupTarget | null>(null);

  const effectiveWeek = nflState?.season_type === 'regular' ? nflState.week : 1;

  // Counted across every season, so it arrives on its own rather than holding
  // up the rest of the dashboard.
  useEffect(() => {
    fetch('/api/league-totals')
      .then(r => r.json())
      .then(d => { if (d?.totals) setTotals(d); })
      .catch(() => { /* the cards fall back to a placeholder */ });
  }, []);

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
          // Points against is not in that aggregate; sum it from the rosters.
          setPaByUser(await allTimePointsAgainst(leagueId).catch(() => ({})));
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
        .map(([userId, s]: any) => ({
          user: users.find((u: any) => u.user_id === userId),
          userId,
          ...s,
          totalPointsAgainst: paByUser[userId],
        }))
        .filter((x: any) => x.user)
        .sort((a: any, b: any) => {
          if (Math.abs(b.winPercentage - a.winPercentage) > 0.001) return b.winPercentage - a.winPercentage;
          if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
          return b.championships - a.championships;
        })
    : [];

  const effectiveStatus = getEffectiveLeagueStatus(league, nflState);
  const playoffTeams    = getDefaultValue(league.settings?.playoff_teams, 6);

  // ── Spotlight subject ──────────────────────────────────────────────────
  // Once games are on the board the standings leader is the live story; before
  // then (preseason, where every record is 0-0) that card would be empty, so
  // the reigning champion carries it instead.
  const gamesPlayed = sortedRosters.some(
    (r: any) => getDefaultValue(r.settings?.wins, 0) + getDefaultValue(r.settings?.losses, 0) > 0,
  );

  const leaderRoster = gamesPlayed ? sortedRosters[0] : null;
  const leaderUser   = leaderRoster ? users.find((u: any) => u.user_id === leaderRoster.owner_id) : null;

  const reigningChampion = historyData?.champions?.length
    ? [...historyData.champions].sort((a: any, b: any) => parseInt(b.season) - parseInt(a.season))[0]
    : null;

  const spotlight = leaderUser && leaderRoster
    ? {
        eyebrow: 'Current Leader',
        name:    censorTeamName(leaderUser.metadata?.team_name || leaderUser.display_name),
        avatar:  leaderUser.avatar,
        userId:  leaderUser.user_id,
        line:    formatRecord(
          getDefaultValue(leaderRoster.settings?.wins, 0),
          getDefaultValue(leaderRoster.settings?.losses, 0),
          getDefaultValue(leaderRoster.settings?.ties, 0),
        ),
        lineLabel: 'Record',
        metric:  formatPoints(
          getDefaultValue(leaderRoster.settings?.fpts, 0) +
          getDefaultValue(leaderRoster.settings?.fpts_decimal, 0) / 100,
        ),
        metricLabel: 'Points For',
      }
    : reigningChampion
      ? {
          eyebrow: 'Reigning Champion',
          name:    censorTeamName(reigningChampion.username),
          avatar:  reigningChampion.avatar,
          userId:  reigningChampion.userId,
          // Career title count rather than that season's record — the
          // championship record doesn't always carry a `details.record`, and
          // an em-dash in the hero card is worse than no stat at all.
          line:    String(
            historyData.champions.filter((c: any) => c.userId === reigningChampion.userId).length,
          ),
          lineLabel: 'Career Titles',
          // No second stat: the season they won is already implied by
          // "Reigning Champion", so spelling it out just added noise.
          metric:  undefined,
          metricLabel: undefined,
        }
      : null;

  const currentSeason = nflState?.season ?? league?.season ?? '';
  const headerSubtitle = `Season ${currentSeason} · ${formatLeagueStatus(effectiveStatus)}`;

  return (
    <PageLayout
      title="Home"
      subtitle={headerSubtitle}
    >
      <div className="space-y-6">

        {/* ── The league at a glance ── */}
        {historyData && historyData.totalSeasons > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <PulseStat
              icon={CalendarDays}
              label="Seasons"
              value={String(historyData.totalSeasons)}
              sub={seasons.length ? `since ${[...seasons].sort()[0]}` : undefined}
              href="/history"
            />
            <PulseStat
              icon={Swords}
              label="Games"
              value={historyData.totalGames.toLocaleString()}
              sub="all time"
              href="/matchups"
            />
            <PulseStat
              icon={Flame}
              label="Best score"
              value={formatPoints(historyData.highestScore)}
              sub="single week"
              href="/history"
            />
            <PulseStat
              icon={Trophy}
              label="Champions"
              value={String(historyData.uniqueChampionsCount)}
              sub={`${historyData.champions.length} title${historyData.champions.length === 1 ? '' : 's'}`}
              href="/history"
            />
            <PulseStat
              icon={ArrowLeftRight}
              label="Trades"
              value={totals ? totals.totals.trade.toLocaleString() : '...'}
              sub={totals ? `${totals.bySeason[0]?.trades ?? 0} this season` : undefined}
              href="/transactions"
            />
            <PulseStat
              icon={Receipt}
              label="Moves"
              value={totals ? totals.totals.total.toLocaleString() : '...'}
              sub={totals ? `${totals.totals.waiver.toLocaleString()} on waivers` : undefined}
              href="/transactions"
            />
          </div>
        )}

        {/* ── Trophy case ── */}
        {historyData && historyData.champions.length > 0 && (
          <TrophyCase
            champions={historyData.champions}
            currentSeason={String(nflState?.season ?? new Date().getFullYear())}
            leagueSeasons={seasons}
          />
        )}

        {/* ── Live content from the AI desk + media feed ── */}
        <LeagueCarousel />

        {/* ── Transaction ticker ── */}
        <TransactionTicker />

        {/* ── This Week&apos;s Battles ── */}
        {league.status === 'in_season' && currentWeekMatchups.length > 0 && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle>This Week&apos;s Battles</CardTitle>
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
                      <button
                        key={matchup.id}
                        onClick={() => setOpenMatchup({
                          a: { userId: matchup.team1.userId, teamName: matchup.team1.name, avatar: matchup.team1.avatar },
                          b: { userId: matchup.team2.userId, teamName: matchup.team2.name, avatar: matchup.team2.avatar },
                        })}
                        className="relative w-full overflow-hidden rounded-xl border border-border bg-background text-left transition-colors hover:border-primary/40"
                      >
                        {matchup.isHighlight && (
                          <div className="absolute inset-x-0 top-0 h-px bg-primary/50" />
                        )}

                        {/* Team 1 */}
                        <div className={cn(
                          'flex items-center gap-3 px-4 py-3.5',
                          t1Winning && 'bg-primary/[0.04]',
                        )}>
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Avatar avatarId={matchup.team1.avatar} size={30} className="shrink-0 rounded-lg" />
                            <span className={cn('min-w-0 truncate text-sm font-medium leading-tight',
                              t1Winning ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                              {matchup.team1.name}
                            </span>
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
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Avatar avatarId={matchup.team2.avatar} size={30} className="shrink-0 rounded-lg" />
                            <span className={cn('min-w-0 truncate text-sm font-medium leading-tight',
                              t2Winning ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                              {matchup.team2.name}
                            </span>
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
                      </button>
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
              <CardTitle>Standings</CardTitle>
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
                <StandingsTable
                  rosters={selectedSeason === 'all-time' ? undefined : sortedRosters}
                  users={users}
                  allTime={selectedSeason === 'all-time' ? allTimeStandings : undefined}
                  playoffTeams={playoffTeams}
                  censor={censorTeamName}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <MatchupDetailModal target={openMatchup} onClose={() => setOpenMatchup(null)} />
    </PageLayout>
  );
}
