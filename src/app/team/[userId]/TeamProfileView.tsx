'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { TeamProfileResponse, SeasonEntry, RivalEntry } from '@/app/api/team/[userId]/route';

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

// ── Franchise report: deterministic flavor derived from real performance ────

interface FranchiseData {
  stadiumName: string;
  tierLabel: string;
  level: number;
  capacity: number;
  attendance: number;
  attendancePct: number;
  ticketPrice: number;
  merchTier: string;
  merchBlurb: string;
  upgrades: { label: string; unlocked: boolean; hint: string }[];
}

function computeFranchise(p: TeamProfileResponse): FranchiseData {
  const { career, advanced, rings } = p;
  const adv = advanced ?? { consistency: 50, explosiveness: 50, clutch: 50, efficiency: 50, momentum: 50, luck: 50 };

  const level = Math.min(5, 1 + career.championships * 2 + (career.winPct >= 60 ? 1 : 0) + (career.playoffAppearances >= 3 ? 1 : 0));
  const TIERS = [
    { suffix: 'Fieldhouse', label: 'Grassroots' },
    { suffix: 'Park', label: 'Rising' },
    { suffix: 'Stadium', label: 'Established' },
    { suffix: 'Arena', label: 'Contender' },
    { suffix: 'Coliseum', label: 'Dynasty' },
  ][level - 1];

  const capacity = [8000, 16000, 29000, 46000, 68000][level - 1];
  const formScore = Math.max(0, Math.min(100, career.winPct * 0.5 + adv.momentum * 0.4 + adv.luck * 0.1));
  const attendancePct = Math.max(38, Math.min(99, Math.round(42 + formScore * 0.56)));
  const attendance = Math.round(capacity * attendancePct / 100);

  const ticketPrice = Math.round(22 + career.championships * 18 + career.regularSeasonTitles * 6 + career.winPct * 0.35 + (adv.explosiveness > 70 ? 8 : 0));

  const merchScore = Math.max(0, Math.min(100, adv.explosiveness * 0.4 + career.championships * 15 + adv.clutch * 0.2 + Math.min(career.totalTrades, 20) * 0.5));
  const merchTier = merchScore >= 80 ? 'Sellout Every Drop' : merchScore >= 60 ? 'Hot Commodity' : merchScore >= 35 ? 'Steady Seller' : 'Slow Mover';
  const bestHighlight = p.recordsHeld.find(r => ['highScore', 'blowout'].includes(r.type));
  const merchBlurb = bestHighlight
    ? `Jerseys flew off the shelf after: "${bestHighlight.description}"`
    : career.championships > 0
      ? 'Championship gear still moves steady, years later.'
      : 'The pro shop is waiting on a signature moment.';

  const topRivalGames = p.rivals[0]?.gamesPlayed ?? 0;

  const upgrades = [
    { label: 'Championship Rafters', unlocked: career.championships > 0, hint: 'Win a title' },
    { label: 'Retractable Roof', unlocked: adv.explosiveness >= 65, hint: 'Explosiveness 65+' },
    { label: 'Luxury Suites', unlocked: adv.consistency >= 65, hint: 'Consistency 65+' },
    { label: 'Clutch City Jumbotron', unlocked: adv.clutch >= 65, hint: 'Clutch 65+' },
    { label: 'Rivalry Wing', unlocked: topRivalGames >= 5, hint: 'A rivalry with 5+ games' },
    { label: 'Analytics War Room', unlocked: adv.efficiency >= 65, hint: 'Efficiency 65+' },
  ];

  return {
    stadiumName: `${p.teamName} ${TIERS.suffix}`,
    tierLabel: TIERS.label,
    level,
    capacity, attendance, attendancePct, ticketPrice, merchTier, merchBlurb,
    upgrades,
  };
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

  const franchise = useMemo(() => data ? computeFranchise(data) : null, [data]);

  if (loading) return <Skeleton />;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-sm text-muted-foreground">{error ?? 'Manager not found.'}</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Back to Overview
        </Link>
      </div>
    );
  }

  const { career } = data;
  const seasonRange = data.firstSeason === data.currentSeason ? data.firstSeason : `${data.firstSeason}-${data.currentSeason}`;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 pb-16 space-y-8">
      <Link href="/" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="h-3.5 w-3.5" /> Overview
      </Link>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <Avatar avatarId={data.avatar} size={96} className="rounded-2xl" />
          {career.championships > 0 && (
            <div className="absolute inset-0 -z-10 rounded-2xl bg-primary/30 blur-xl opacity-60" />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{data.teamName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.seasonsPlayed} season{data.seasonsPlayed !== 1 ? 's' : ''} &middot; {seasonRange} &middot; {fmtRecord(career.wins, career.losses, career.ties)} all-time
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {career.championships > 0 && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                {career.championships}&times; Champion
              </span>
            )}
            {career.regularSeasonTitles > 0 && (
              <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {career.regularSeasonTitles}&times; Reg. Season Title
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Trophy case */}
      {data.rings.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Ring Case</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.rings.map(ring => (
              <div key={ring.season} className="rounded-xl border border-border bg-card p-2">
                <ChampionRing modelPath={ring.modelPath} height={140} />
                <p className="mt-1 text-center text-xs font-semibold text-foreground">{ring.season} Champion</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-5 text-center">
          <p className="text-sm text-muted-foreground">No rings yet. The story&apos;s still being written.</p>
        </div>
      )}

      {/* Career stats */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Career</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell label="Record" value={fmtRecord(career.wins, career.losses, career.ties)} sub={`${career.winPct}% win rate`} />
          <StatCell label="Points For" value={career.ppg.toFixed(1)} sub="per game" />
          <StatCell label="Points Against" value={career.ppgAgainst.toFixed(1)} sub="per game" />
          <StatCell label="Playoff Berths" value={String(career.playoffAppearances)} sub={`of ${data.seasonsPlayed} seasons`} />
          <StatCell label="Best Finish" value={career.bestFinish > 0 ? ordinal(career.bestFinish) : '-'} />
          {career.worstFinish > 0 && <StatCell label="Worst Finish" value={ordinal(career.worstFinish)} />}
          <StatCell label="Trades Made" value={String(career.totalTrades)} />
        </div>
      </div>

      {/* Franchise report */}
      {franchise && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">The Franchise</p>
            <p className="text-[10px] italic text-muted-foreground/40">simulated for fun, driven by real performance</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold text-foreground">{franchise.stadiumName}</p>
                <p className="text-xs text-muted-foreground/70">{franchise.tierLabel} &middot; Level {franchise.level} venue</p>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                ${franchise.ticketPrice} avg ticket
              </span>
            </div>

            <div className="mb-4">
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground/70">Attendance</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {franchise.attendance.toLocaleString()} / {franchise.capacity.toLocaleString()} ({franchise.attendancePct}%)
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${franchise.attendancePct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="h-full rounded-full bg-primary/70"
                />
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground/70">Merch sales</span>
                <span className="font-bold text-foreground">{franchise.merchTier}</span>
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground/60">{franchise.merchBlurb}</p>
            </div>

            <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">Stadium Upgrades</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {franchise.upgrades.map(u => (
                <div
                  key={u.label}
                  className={cn(
                    'rounded-lg border px-2.5 py-2',
                    u.unlocked ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-background/30',
                  )}
                >
                  <p className={cn('text-[11px] font-semibold', u.unlocked ? 'text-foreground' : 'text-muted-foreground/50')}>{u.label}</p>
                  <p className="text-[10px] text-muted-foreground/50">{u.unlocked ? 'Unlocked' : u.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Story timeline */}
      {data.seasons.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">The Story</p>
          <div className="relative space-y-3">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
            {[...data.seasons].reverse().map(season => (
              <SeasonCard key={season.season} season={season} />
            ))}
          </div>
        </div>
      )}

      {/* Rivalries */}
      {data.rivals.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Rivalries</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.rivals.map(r => <RivalCard key={r.userId} rival={r} />)}
          </div>
        </div>
      )}

      {/* Records held */}
      {data.recordsHeld.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Records &amp; Achievements</p>
          <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
            {data.recordsHeld.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{r.description}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                    {RECORD_LABELS[r.type] ?? r.type} &middot; {r.season}{r.week ? ` · Week ${r.week}` : ''}
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
        </div>
      )}
    </div>
  );
}
