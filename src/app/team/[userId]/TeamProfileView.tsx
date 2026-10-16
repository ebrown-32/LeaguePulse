'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { BookOpen, CalendarDays, ChevronLeft, Flame, Star, Swords, TrendingUp, Trophy } from '@/components/icons';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { TeamProfileResponse, SeasonEntry, RivalEntry } from '@/app/api/team/[userId]/route';
import FranchiseHQ from './tycoon/FranchiseHQ';
import { useFranchise, FranchiseStorySection, ManageLink, BackLink, fieldLogo } from './Franchise';
import { Section } from './Section';

const ChampionRing = dynamic(() => import('@/components/ui/ChampionRing'), { ssr: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRecord(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const RECORD_LABELS: Record<string, string> = {
  highScore: 'Highest Score', lowScore: 'Lowest Score', blowout: 'Biggest Blowout',
  closeGame: 'Closest Win', winStreak: 'Win Streak', championship: 'Championship',
  runnerUp: 'Runner-Up', regularSeasonChamp: 'Regular Season Title', playoffAppearance: 'Playoff Berth',
  perfectSeason: 'Perfect Season', mostImproved: 'Most Improved', biggestUpset: 'Biggest Upset',
  championshipGame: 'Championship Game', playoffHighScore: 'Playoff High', playoffLowScore: 'Playoff Low',
  consistency: 'Consistency', explosiveness: 'Explosiveness', seasonHigh: 'Season High', seasonLow: 'Season Low',
};


/** What the records on this page count, in a sentence or three. */
function recordNote(n: { medianGame: boolean; seasonInProgress: string | null }): string {
  const includes = [
    n.medianGame && 'the weekly median game, a second result each week',
    n.seasonInProgress && `the ${n.seasonInProgress} season so far`,
  ].filter(Boolean);
  return [
    `The regular season record covers every season played${includes.length ? `, including ${includes.join(', and ')}` : ''}.`,
    'The playoff record counts title bracket games, third place included, with a two week round as one game.',
    'Points per game count every game played, playoff and consolation games included.',
    n.seasonInProgress ? 'Your league app may leave a season in progress out of its all-time record, so its totals can differ until the season ends.' : '',
  ].filter(Boolean).join(' ');
}

// ── Micro-components ─────────────────────────────────────────────────────────

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}

// ── Season timeline ──────────────────────────────────────────────────────────

function SeasonCard({ season }: { season: SeasonEntry }) {
  const record = fmtRecord(season.wins, season.losses, season.ties);
  return (
    <div className="relative pl-8">
      <span className={cn(
        'absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-background',
        season.championship ? 'border-primary' : season.playoffAppearance ? 'border-primary/50' : 'border-border',
      )} />
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-foreground">{season.season}</span>
            {season.championship && (
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">Champion</span>
            )}
            {!season.championship && season.regularSeasonChamp && (
              <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Reg. Season Title</span>
            )}
            {!season.championship && !season.regularSeasonChamp && season.playoffAppearance && (
              <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Playoffs</span>
            )}
          </div>
          <span className="text-sm font-bold tabular-nums text-foreground">{record}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
          <span>{season.pointsFor.toFixed(1)} pts for</span>
          <span>{season.pointsAgainst.toFixed(1)} pts against</span>
        </div>
        {season.highlights.length > 0 && (
          <ul className="mt-2.5 space-y-1 border-t border-border/40 pt-2.5">
            {season.highlights.map((h, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted-foreground/70">{h}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Rivals ───────────────────────────────────────────────────────────────────

function RivalCard({ rival }: { rival: RivalEntry }) {
  const total = Math.max(1, rival.gamesPlayed);
  const winShare = (rival.wins / total) * 100;
  return (
    <Link href={`/team/${rival.userId}`} className="block rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40">
      <div className="mb-2 flex items-center gap-2 min-w-0">
        <Avatar avatarId={rival.avatar} size={24} className="rounded shrink-0" />
        <span className="truncate text-sm font-semibold text-foreground">{rival.teamName}</span>
      </div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span className="font-bold tabular-nums text-foreground">{fmtRecord(rival.wins, rival.losses, rival.ties)}</span>
        <span>{rival.gamesPlayed} games</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-rose-400/20">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${winShare}%` }} />
      </div>
      {/* Every game they played; providers' own head to head is often the regular season alone. */}
      {rival.breakdown && rival.breakdown !== `${fmtRecord(rival.wins, rival.losses, rival.ties)} regular season` && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{rival.breakdown}</p>
      )}
    </Link>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 rounded-2xl bg-muted" />
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl border border-border bg-card" />)}
      </div>
      <div className="h-64 rounded-xl border border-border bg-card" />
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function TeamProfileView({ userId }: { userId: string }) {
  const [data, setData] = useState<TeamProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/team/${userId}`)
      .then(r => r.json())
      .then((d: TeamProfileResponse & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const { info: identity, mine } = useFranchise(userId);

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error ?? 'Manager not found.'}</p>
        <div className="mt-4"><BackLink fallback="/franchises" label="All franchises" /></div>
      </div>
    );
  }

  const { career } = data;
  const seasonRange = data.firstSeason === data.currentSeason ? data.firstSeason : `${data.firstSeason}-${data.currentSeason}`;

  const color = identity?.identity.color ?? null;
  const motto = identity?.identity.motto, bio = identity?.identity.bio;
  const story = identity?.story;
  const storyBits = story ? [
    story.trades ? `${story.trades} trade${story.trades === 1 ? '' : 's'}` : null,
    story.bestGame ? `best score ${story.bestGame.points.toFixed(1)}` : null,
    story.firstPicks.length ? `${story.firstPicks.length} drafts` : null,
  ].filter(Boolean).join(', ') : '';
  const allTime = data.recordsHeld.filter(r => r.isAllTime).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 pb-16 sm:px-6 lg:px-8" style={color ? { ['--team' as string]: color } : undefined}>
      <BackLink fallback="/franchises" label="All franchises" />

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex items-center gap-4 sm:gap-5">
        <div className="pointer-events-none absolute -left-10 -top-10 -z-10 h-40 w-64 rounded-full opacity-25 blur-3xl"
          style={{ background: color ?? 'hsl(var(--primary))' }} />
        <div className="shrink-0">
          {identity?.identity.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={identity.identity.logoUrl} alt="" width={80} height={80} className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20"
                style={color ? { boxShadow: `0 0 0 3px ${color}` } : undefined} />
            : <Avatar avatarId={data.avatar} size={80} className="!h-16 !w-16 rounded-2xl sm:!h-20 sm:!w-20" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{data.teamName}</h1>
            {mine && <ManageLink franchiseId={userId} />}
          </div>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {fmtRecord(career.wins, career.losses, career.ties)} in the regular season{career.playoffWins + career.playoffLosses > 0 ? `, ${career.playoffWins}-${career.playoffLosses} in the playoffs` : ''}, {data.seasonsPlayed} season{data.seasonsPlayed !== 1 ? 's' : ''} ({seasonRange})
            {career.championships > 0 && <span className="font-semibold text-foreground">, {career.championships}&times; champion</span>}
          </p>
          {motto && <p className="mt-1 truncate text-[14px] italic text-foreground/80">&ldquo;{motto}&rdquo;</p>}
          {(identity?.manager || identity?.claimUrl) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {identity.manager && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color ?? 'hsl(var(--primary))' }} />
                  Managed by {identity.manager.name}
                </span>
              )}
              {/* Claiming and editing both go through a LeaguePulse account, so say so. */}
              {identity.claimUrl && (
                <a href={identity.claimUrl} className="rounded-full bg-foreground px-3 py-1 text-[11.5px] font-semibold text-background transition hover:bg-foreground/85">
                  Sign up / log in with LeaguePulse to claim
                </a>
              )}
              {identity.manager && !mine && identity.editUrl && (
                <a href={identity.editUrl} className="rounded-full border border-border px-3 py-0.5 text-[11.5px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
                  Your team? Log in with LeaguePulse to edit
                </a>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* The ring case, then the stadium, then everything else, one collapsible section each */}
      <Section scope="team" id="rings" icon={Trophy} title="Ring case" index={0} defaultOpen
        summary={data.rings.length ? `${data.rings.length} championship ring${data.rings.length === 1 ? '' : 's'}: ${data.rings.map(r => r.season).join(', ')}` : 'No rings yet. The story is still being written.'}>
        {data.rings.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.rings.map(ring => (
              <div key={ring.season} className="rounded-xl border border-border bg-background/50 p-2">
                {ring.modelPath ? (
                  <ChampionRing modelPath={ring.modelPath} height={140} />
                ) : (
                  <div className="flex h-[140px] items-center justify-center">
                    <Trophy className="h-10 w-10 text-primary" />
                  </div>
                )}
                <p className="mt-1 text-center text-xs font-semibold text-foreground">{ring.season} Champion</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No rings yet. The story&apos;s still being written.</p>
        )}
      </Section>

      <FranchiseHQ franchiseId={userId} mode="public" color={color} teamName={data.teamName}
        logo={fieldLogo(identity?.identity.logoUrl, data.avatar)} look={identity?.identity.look ?? null} stadiumName={identity?.identity.stadiumName ?? null}>

        <Section scope="team" id="career" icon={TrendingUp} title="Career" index={2}
          summary={`${fmtRecord(career.wins, career.losses, career.ties)} regular season, ${career.playoffWins}-${career.playoffLosses} playoffs, ${career.playoffAppearances} playoff berth${career.playoffAppearances === 1 ? '' : 's'}`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCell label="Regular season" value={fmtRecord(career.wins, career.losses, career.ties)} sub={`${career.winPct}% win rate`} />
            <StatCell label="Playoffs" value={`${career.playoffWins}-${career.playoffLosses}`} sub="title bracket games" />
            <StatCell label="Points For" value={career.ppg.toFixed(1)} sub="per game" />
            <StatCell label="Points Against" value={career.ppgAgainst.toFixed(1)} sub="per game" />
            <StatCell label="Playoff Berths" value={String(career.playoffAppearances)} sub={`of ${data.seasonsPlayed} seasons`} />
            <StatCell label="Best Finish" value={career.bestFinish > 0 ? ordinal(career.bestFinish) : '-'} />
            {career.worstFinish > 0 && <StatCell label="Worst Finish" value={ordinal(career.worstFinish)} />}
            <StatCell label="Trades Made" value={String(career.totalTrades)} />
          </div>
          {/* Say what the records count, so they can be checked against the league app's. */}
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">{recordNote(data.recordNotes)}</p>
        </Section>

        {bio && (
          <Section scope="team" id="about" icon={BookOpen} title="About the franchise" index={4} summary={bio.split('\n')[0]}>
            <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{bio}</p>
          </Section>
        )}

        {story && storyBits && (
          <Section scope="team" id="history" icon={Flame} title="Franchise history" index={5} summary={storyBits[0].toUpperCase() + storyBits.slice(1)}>
            <FranchiseStorySection story={story} />
          </Section>
        )}

        {data.seasons.length > 0 && (
          <Section scope="team" id="seasons" icon={CalendarDays} title="Season by season" index={6}
            summary={`${data.seasons.length} season${data.seasons.length === 1 ? '' : 's'}, ${seasonRange}`}>
            <div className="relative space-y-3">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
              {[...data.seasons].reverse().map(season => (
                <SeasonCard key={season.season} season={season} />
              ))}
            </div>
          </Section>
        )}

        {data.rivals.length > 0 && (
          <Section scope="team" id="rivals" icon={Swords} title="Rivalries" index={7}
            summary={`${data.rivals.length} rival${data.rivals.length === 1 ? '' : 's'}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.rivals.map(r => <RivalCard key={r.userId} rival={r} />)}
            </div>
          </Section>
        )}

        {data.recordsHeld.length > 0 && (
          <Section scope="team" id="records" icon={Star} title="Records and achievements" index={8}
            summary={`${data.recordsHeld.length} held${allTime ? `, ${allTime} all-time` : ''}`}>
            <div className="divide-y divide-border/50 rounded-xl border border-border">
              {data.recordsHeld.map((r, i) => (
                <div key={i} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{r.description}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                      {RECORD_LABELS[r.type] ?? r.type}, {r.season}{r.week ? `, week ${r.week}` : ''}
                    </p>
                  </div>
                  {r.isAllTime && (
                    <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
                      All-Time
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </FranchiseHQ>
    </div>
  );
}
