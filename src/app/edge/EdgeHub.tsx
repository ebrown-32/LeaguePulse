'use client';

/**
 * The Edge: the league's research desk. One dataset (api/edge/research: every relevant player's
 * season in this league's scoring, usage, matchups, projections, who owns whom) read six ways:
 *
 *   My week     your lineup against the best one, the calls and why, the wire
 *   Players     every player in a sortable table; tap for his page, tick to compare
 *   Matchups    what every defense gives up to every position
 *   Teams       the league's rosters, position by position, and any two head to head
 *   Waivers     the free agents, by what they project
 *   The field   what leagues like this one are doing (the market, hosted sites)
 *
 * The tab and an open player are kept in the address, so a view can be sent to the group chat.
 * "My team" is remembered in this browser.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { profile, replacement, type Player, type Profile, type Research } from '@/lib/edge/metrics';
import { EdgeCtx, Face, type EdgeData } from './parts';
import PlayersTab from './PlayersTab';
import MatchupsTab from './MatchupsTab';
import TeamsTab from './TeamsTab';
import WeekTab from './WeekTab';
import { CompareSheet, PlayerPanel } from './PlayerPanel';
import EdgeView from './EdgeView';

const TABS = [
  { id: 'week', label: 'My week' }, { id: 'players', label: 'Players' }, { id: 'matchups', label: 'Matchups' },
  { id: 'teams', label: 'Teams' }, { id: 'waivers', label: 'Waivers' }, { id: 'field', label: 'The field' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TEAM_KEY = 'lp_edge_team';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export default function EdgeHub({ hosted }: { hosted: boolean }) {
  const [r, setR] = useState<Research | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('week');
  const [player, setPlayer] = useState<string | null>(null);
  const [mine, setMineState] = useState<number | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  /** The address has been read: only then is the view written back to it. */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/edge/research').then(async res => { const d = await res.json(); if (!res.ok) throw new Error(d?.error || 'Could not load'); return d as Research; })
      .then(d => {
        setR(d);
        // The team chosen here before; else the one picked for Pick'em.
        const saved = Number(store.get(TEAM_KEY));
        const pickem = store.get('lp_pickem_team');
        const t = d.teams.find(x => x.rosterId === saved) ?? d.teams.find(x => x.userId === pickem);
        if (t) setMineState(t.rosterId);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load'));
    const q = new URLSearchParams(location.search);
    const t = q.get('tab') as TabId | null;
    if (t && TABS.some(x => x.id === t)) setTab(t);
    if (q.get('p')) setPlayer(q.get('p'));
    setReady(true);
  }, []);

  // The view, in the address.
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    q.set('tab', tab);
    if (player) q.set('p', player); else q.delete('p');
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }, [tab, player, ready]);

  const setMine = useCallback((id: number | null) => { setMineState(id); store.set(TEAM_KEY, id === null ? null : String(id)); }, []);
  const toggleCompare = useCallback((id: string) => setCompare(c => (c.includes(id) ? c.filter(x => x !== id) : c.length >= 3 ? c : [...c, id])), []);

  const data = useMemo<EdgeData | null>(() => {
    if (!r) return null;
    const byId = new Map<string, Player>(r.players.map(p => [p.id, p]));
    const prof = new Map<string, Profile>(r.players.map(p => [p.id, profile(p)]));
    return {
      r, byId, prof, repl: replacement(r.players, r.teams.length || 10, r.slots),
      team: new Map(r.teams.map(t => [t.rosterId, t])),
      mine, setMine, open: setPlayer, compare, toggleCompare,
    };
  }, [r, mine, setMine, compare, toggleCompare]);

  if (error) return <p className="rounded-2xl border border-border bg-card p-6 text-center text-[13.5px] text-muted-foreground">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-10 w-full max-w-md animate-pulse rounded-xl bg-muted/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />
        <div className="h-72 animate-pulse rounded-2xl bg-muted/40" />
        <p className="text-center text-[12.5px] text-muted-foreground">Reading the season: every game, scored the way your league scores.</p>
      </div>
    );
  }
  const tabs = TABS.filter(t => t.id !== 'field' || hosted);

  return (
    <EdgeCtx.Provider value={data}>
      <nav className="sticky top-0 z-20 -mx-4 mb-4 overflow-x-auto border-b border-border bg-background/90 px-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-1.5" aria-label="The Edge">
        <div className="flex gap-1 py-1.5" role="tablist">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('relative shrink-0 rounded-lg px-3.5 py-2 text-[13.5px] font-bold transition-colors', tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {tab === t.id && <motion.span layoutId="edge-tab" className="absolute inset-0 rounded-lg bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        {tab === 'week' && <WeekTab />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'matchups' && <MatchupsTab />}
        {tab === 'teams' && <TeamsTab />}
        {tab === 'waivers' && <PlayersTab only="fa" />}
        {tab === 'field' && hosted && <EdgeView />}
      </motion.div>

      {/* The compare tray: who's ticked, and the way in. */}
      <AnimatePresence>
        {compare.length > 0 && !comparing && !player && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 shadow-2xl">
            <span className="flex -space-x-2">{compare.map(id => { const p = data.byId.get(id); return p ? <span key={id} className="rounded-full ring-2 ring-card"><Face p={p} size={30} /></span> : null; })}</span>
            <button type="button" onClick={() => setComparing(true)} disabled={compare.length < 2} className="rounded-xl bg-primary px-3.5 py-2 text-[13px] font-bold text-primary-foreground disabled:opacity-50">
              {compare.length < 2 ? 'Tick one more to compare' : `Compare ${compare.length}`}
            </button>
            <button type="button" onClick={() => setCompare([])} className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {player && <PlayerPanel key={player} id={player} onClose={() => setPlayer(null)} />}
      {comparing && compare.length > 0 && <CompareSheet onClose={() => setComparing(false)} />}
    </EdgeCtx.Provider>
  );
}
