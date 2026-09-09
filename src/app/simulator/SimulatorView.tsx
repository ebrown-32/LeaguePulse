'use client';

/**
 * The simulator's shell: loads the league, owns the worker, and switches
 * between the six surfaces.
 *
 * Every tab reads from one shared simulation run, so forcing a result on the
 * What if tab moves the odds board, the team outlook and the draft order
 * together rather than each one re-deriving its own answer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSimulator, useSeasonSim } from '@/lib/sim/useSimulator';
import type { SimLeague, Pin, SimRequest } from '@/lib/sim/types';
import { roundLengths } from '@/lib/sim/playoffs';
import OddsBoard from './components/OddsBoard';
import ForceResults from './components/ForceResults';
import TeamDetail from './components/TeamDetail';
import MatchupSim from './components/MatchupSim';
import TankTracker from './components/TankTracker';
import AlternateTimelines from './components/AlternateTimelines';
import { Eyebrow } from './components/shared';
import HoneycombLoader from '@/components/ui/honeycomb-loader';
import {
  LineChart, Swords, ListOrdered, GitBranch, AlertTriangle,
  Trophy, SlidersHorizontal,
} from 'lucide-react';

const ITERATIONS = 10000;
const SEED = 20260908;

/**
 * One tab per question, rather than one tab per data source.
 *
 *   Odds      where does the league stand
 *   What if   what happens if these results go my way
 *   Team      how does one team look, and why
 *   Matchup   who wins this game on the real schedule
 *   Draft     where do I pick if I miss
 *   Timelines what if that trade never happened
 *
 * Odds, What if and Team were all one "Season" tab, which meant a league board,
 * a scenario builder and a per-team deep dive shared a single long scroll.
 */
type Tab = 'odds' | 'whatif' | 'team' | 'matchup' | 'draft' | 'timelines';

const TABS: { id: Tab; label: string; icon: typeof LineChart }[] = [
  { id: 'odds',      label: 'Odds',      icon: Trophy      },
  { id: 'whatif',    label: 'What if',   icon: SlidersHorizontal },
  { id: 'team',      label: 'Team',      icon: LineChart   },
  { id: 'matchup',   label: 'Matchup',   icon: Swords      },
  { id: 'draft',     label: 'Draft',     icon: ListOrdered },
  { id: 'timelines', label: 'Timelines', icon: GitBranch   },
];

interface Meta {
  seasonsOfHistory: number;
  residualSamples: number;
  leagueMean: number;
  leagueSd: number;
  /** Remaining weeks with real Sleeper weekly projections behind them. */
  projectedWeeks: number;
  maxWins: number;
}

export default function SimulatorView() {
  const [league, setLeague] = useState<SimLeague | null>(null);
  const [meta, setMeta]     = useState<Meta | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [tab, setTab]       = useState<Tab>('odds');
  const [pins, setPins]     = useState<Pin[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const { ready, runSeason, runMatchup } = useSimulator();

  useEffect(() => {
    fetch('/api/simulator')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setLeague(d.league);
        setMeta(d.meta);
        setSelected(d.league.teams[0]?.rosterId ?? null);
      })
      .catch(() => setError('Could not reach the league data.'));
  }, []);

  // The live run, pins included.
  const request: SimRequest | null = useMemo(
    () => (league && ready ? { league, pins, iterations: ITERATIONS, seed: SEED } : null),
    [league, ready, pins],
  );
  const { result, running } = useSeasonSim(request, runSeason);

  /**
   * The run indicator, held on screen a beat longer than the run itself.
   *
   * The engine finishes in under fifty milliseconds, so tying the mark straight
   * to `running` made it flash for a frame or two and read as a glitch rather
   * than as feedback. The tail is long enough for the pulse to travel the ring
   * once, which takes about a second: the cells are staggered 0.1s apart and
   * each ramps over a fifth of the 2.1s cycle, so a shorter window shows one
   * hexagon blinking rather than the animation.
   *
   * Decoration only. The board updates the moment the result arrives, and the
   * real elapsed time is printed right beside this, so a lingering mark cannot
   * misrepresent how long the run took.
   */
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (running) { setPulsing(true); return; }
    const t = setTimeout(() => setPulsing(false), 1200);
    return () => clearTimeout(t);
  }, [running]);

  // A second, permanently unpinned run, so every pinned number can be shown
  // against what it would have been. Without it a pinned board is just numbers;
  // with it you can see exactly what your scenario bought.
  const baseRequest: SimRequest | null = useMemo(
    () => (league && ready ? { league, pins: [], iterations: ITERATIONS, seed: SEED } : null),
    [league, ready],
  );
  const { result: baseResult } = useSeasonSim(baseRequest, runSeason);

  const baseline = useMemo(() => {
    if (!baseResult || pins.length === 0) return null;
    return new Map(baseResult.teams.map(t => [t.rosterId, t.playoffOdds]));
  }, [baseResult, pins.length]);

  const togglePin = useCallback((week: number, home: number, away: number, winner: number) => {
    setPins(prev => {
      const i = prev.findIndex(p => p.week === week
        && ((p.homeRosterId === home && p.awayRosterId === away)
         || (p.homeRosterId === away && p.awayRosterId === home)));
      if (i === -1) return [...prev, { week, homeRosterId: home, awayRosterId: away, winnerRosterId: winner }];
      // Clicking the pinned winner again clears it; clicking the other team flips it.
      if (prev[i].winnerRosterId === winner) return prev.filter((_, j) => j !== i);
      const next = [...prev];
      next[i] = { ...next[i], winnerRosterId: winner };
      return next;
    });
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!league || !meta) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-border bg-card py-24">
        <HoneycombLoader style={{ ['--honeycomb-size' as string]: '18px' }} />
        {/* Named, because the wait is real: this pulls three seasons of results
            and a full schedule of weekly projections before the first run. */}
        <p className="text-[12px] text-muted-foreground">Building the model</p>
      </div>
    );
  }

  const outcomes = result?.teams ?? [];

  // Plain-language playoff format, straight from the league's own settings so
  // it stays right if the commissioner changes them.
  const lengths = roundLengths(league.playoffTeams, league.playoffRoundType ?? 0);
  const twoWeekFinal = lengths[lengths.length - 1] === 2;
  const allTwoWeek = lengths.every(l => l === 2);
  const playoffShape = allTwoWeek
    ? 'Every playoff round runs two weeks'
    : twoWeekFinal
      ? 'Two week championship'
      : 'One week per playoff round';

  // Wins the last team inside the field averaged, a usable "what it takes" line.
  const cutoffWins = outcomes.length >= league.playoffTeams
    ? Math.round([...outcomes].sort((a, b) => b.playoffOdds - a.playoffOdds)[league.playoffTeams - 1].avgWins)
    : null;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Scrolls rather than wraps: six tabs do not fit a phone, and a second
            row of tabs reads as a second, unrelated control. */}
        <div className="-mx-4 flex max-w-full gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0
                        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-pressed={active}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sim-tab"
                    className="absolute inset-0 rounded-lg bg-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon className="relative h-3.5 w-3.5" />
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {/*
            Mounted always, revealed on demand.

            The honeycomb's cells are transparent for the first fifth of a 2.1s
            cycle and staggered up to 0.6s behind each other, so a freshly
            mounted one shows literally nothing for its first 400ms and is not
            fully lit for a second. Mounting it per run meant it was invisible
            for the entire time it existed. Leaving it running and fading the
            wrapper means whenever it appears it is already mid-pulse.

            Fixed size so the row never shifts, and generous, because the cells
            paint well outside the element's own box.
          */}
          <span
            aria-hidden={!pulsing}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center transition-opacity duration-200',
              pulsing ? 'opacity-100' : 'opacity-0',
            )}
          >
            <HoneycombLoader style={{ ['--honeycomb-size' as string]: '9px' }} />
          </span>
          <span className="tabular-nums">
            {ITERATIONS.toLocaleString()} seasons
            {result && <span className="ml-1.5 text-muted-foreground/60">in {result.elapsedMs}ms</span>}
          </span>
        </div>
      </div>

      {/* What is actually being simulated, and under which rules. Without this
          the odds float free of any stated context. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{league.season} season</span>
        <span>
          {league.weeksPlayed === 0
            ? `Week 1 of ${league.regularSeasonWeeks}, nothing played yet`
            : `Through week ${league.weeksPlayed} of ${league.regularSeasonWeeks}`}
        </span>
        <span>{league.playoffTeams} playoff teams</span>
        <span>{playoffShape}</span>
        {league.hasMedianGames && <span>Median game on</span>}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === 'odds' && (
            <OddsBoard
              league={league}
              outcomes={outcomes}
              baseline={baseline}
              selectedRosterId={selected}
              onSelect={rid => { setSelected(rid); setTab('team'); }}
            />
          )}

          {tab === 'whatif' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <ForceResults
                league={league}
                pins={pins}
                onToggle={togglePin}
                onClear={() => setPins([])}
                highlightRosterId={selected}
              />
              <OddsBoard
                league={league}
                outcomes={outcomes}
                baseline={baseline}
                selectedRosterId={selected}
                onSelect={setSelected}
              />
            </div>
          )}

          {tab === 'team' && (
            <TeamDetail
              league={league}
              outcomes={outcomes}
              selected={selected}
              onSelect={setSelected}
              maxWins={meta.maxWins}
              cutoffWins={cutoffWins}
            />
          )}

          {tab === 'matchup'   && <MatchupSim league={league} runMatchup={runMatchup} />}
          {tab === 'draft'     && <TankTracker league={league} outcomes={outcomes} />}
          {tab === 'timelines' && <AlternateTimelines />}
        </motion.div>
      </AnimatePresence>

      <ModelNote league={league} meta={meta} />
    </div>
  );
}

/**
 * The footnote that keeps this tool honest.
 *
 * Says where the numbers come from, in plain language, on the page. That is the
 * difference between a model and a magic number.
 */
function ModelNote({ league, meta }: { league: SimLeague; meta: Meta }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <Eyebrow>How this works</Eyebrow>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        Each team&apos;s scoring level is fitted from{' '}
        <span className="text-foreground">{meta.seasonsOfHistory} seasons</span>{' '}
        of real results in this league, blended with Sleeper&apos;s weekly projections, which
        mainly add who is on a bye. Simulated scores resample{' '}
        <span className="text-foreground">{meta.residualSamples} real team-weeks</span>,
        so the shape matches real fantasy scoring rather than a tidy bell curve.
        {league.hasMedianGames && ' This league also awards a weekly result against the ' +
          'league median, so records run to twice the number of weeks.'}
        {' '}The Team tab shows what any one team&apos;s number rests on.
      </p>
    </div>
  );
}
