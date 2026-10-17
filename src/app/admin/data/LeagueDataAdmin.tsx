'use client';

/**
 * League data, in the admin: every season, what its platform kept, and the
 * commissioner's own entries filling in the rest.
 *
 *   Seasons   each season with a plain status. Where the platform kept no
 *             moves (ESPN's oldest seasons), a guided form adds trades and
 *             pickups, with the platform's own count as the target.
 *   Older     seasons from before the league used Sleeper or ESPN, from the
 *             league's own records: teams (tied to existing managers so
 *             all-time records join up), weekly scores, the champion.
 *
 * Entries are kept separately from the platform's data and joined in as it
 * is read (src/lib/manual), so they show on every page, and deleting one puts
 * everything back as it was.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lockScroll } from '@/lib/scrollLock';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowLeftRight, Check, Info, UserPlus, Trophy, CalendarDays } from '@/components/icons';
import type { SeasonGaps } from '@/lib/coverage';
import type { ManualData, ManualMove, ManualSeason, ManualGame, ManualTeam } from '@/lib/manual/model';

// ── Data ────────────────────────────────────────────────────────────────────

interface Team { rosterId: number; userId: string; managerName: string; teamName: string }
interface SeasonRow {
  leagueId: string; season: string; provider: 'sleeper' | 'espn' | 'manual';
  gaps: SeasonGaps | null; teams: Team[]; entered: { trades: number; moves: number };
}
interface Overview { seasons: SeasonRow[]; managers: { userId: string; name: string }[]; manual: ManualData }
interface Player { id: string; name: string; position: string; team: string }

function useApi(password: string) {
  const headers = useMemo(() => ({ 'content-type': 'application/json', 'x-admin-password': password }), [password]);
  const get = useCallback(async () => {
    const r = await fetch('/api/admin/league-data', { headers, cache: 'no-store' });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not load league data');
    return r.json() as Promise<Overview>;
  }, [headers]);
  const post = useCallback(async (body: object) => {
    const r = await fetch('/api/admin/league-data', { method: 'POST', headers, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? 'Could not save');
    return d;
  }, [headers]);
  const search = useCallback(async (q: string): Promise<Player[]> => {
    const r = await fetch(`/api/admin/league-data/players?q=${encodeURIComponent(q)}`, { headers });
    return r.ok ? (await r.json()).players : [];
  }, [headers]);
  return { get, post, search };
}

// ── The tab ─────────────────────────────────────────────────────────────────

export default function LeagueDataAdmin({ adminPassword }: { adminPassword: string }) {
  const api = useApi(adminPassword);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [moveFor, setMoveFor] = useState<{ season: SeasonRow; move?: ManualMove; type?: ManualMove['type'] } | null>(null);
  const [seasonEdit, setSeasonEdit] = useState<{ season?: ManualSeason } | null>(null);
  const [openSeason, setOpenSeason] = useState<string | null>(null);

  const load = useCallback(() => api.get().then(setData).catch(e => setError(e.message)), [api]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{error}</p>;
  if (!data) return <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl border border-border bg-card" />)}</div>;

  const real = data.seasons.filter(s => s.provider !== 'manual');
  const firstReal = real.length ? Math.min(...real.map(s => Number(s.season))) : new Date().getFullYear();
  const movesOf = (leagueId: string) => data.manual.moves.filter(m => m.leagueId === leagueId).sort((a, b) => a.week - b.week);

  return (
    <div className="space-y-8">
      <section>
        <SectionHead icon={CalendarDays} title="Seasons" blurb="What each season’s platform kept. Where it kept less, fill it in from the league’s own memory: it shows on every page, marked as added by you." />
        <div className="mt-4 space-y-3">
          {data.seasons.map(s => (
            <SeasonCard key={s.leagueId} s={s} open={openSeason === s.leagueId} moves={movesOf(s.leagueId)}
              onToggle={() => setOpenSeason(o => (o === s.leagueId ? null : s.leagueId))}
              onAdd={type => setMoveFor({ season: s, type })}
              onEditMove={move => setMoveFor({ season: s, move })}
              onDeleteMove={async id => { await api.post({ action: 'move.delete', id }); load(); }}
              onEditSeason={() => setSeasonEdit({ season: data.manual.seasons.find(x => String(x.season) === s.season) })}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHead icon={Trophy} title="Older seasons" blurb={`Seasons from before ${firstReal}, when the league ran somewhere else: a spreadsheet, a group chat, another app. Add the teams, the scores and the champion, and they join the league’s history, records and rings.`} />
        <button onClick={() => setSeasonEdit({})}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-4 py-5 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
          <span className="text-lg leading-none">+</span> Add a season before {firstReal}
        </button>
      </section>

      <AnimatePresence>
        {moveFor && (
          <MoveSheet key="move" season={moveFor.season} move={moveFor.move} initialType={moveFor.type} search={api.search}
            onClose={() => setMoveFor(null)}
            onSave={async move => { await api.post({ action: 'move.save', move }); setMoveFor(null); setOpenSeason(moveFor.season.leagueId); load(); }} />
        )}
        {seasonEdit && (
          <SeasonSheet key="season" initial={seasonEdit.season} before={firstReal} managers={data.managers}
            taken={data.manual.seasons.map(s => s.season)}
            onClose={() => setSeasonEdit(null)}
            onDelete={seasonEdit.season ? async () => { await api.post({ action: 'season.delete', season: seasonEdit.season!.season }); setSeasonEdit(null); load(); } : undefined}
            onSave={async season => { await api.post({ action: 'season.save', season }); setSeasonEdit(null); load(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionHead({ icon: Icon, title, blurb }: { icon: typeof Info; title: string; blurb: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

// ── One season ──────────────────────────────────────────────────────────────

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
      ok ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      {ok ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />}{label}
    </span>
  );
}

function SeasonCard({ s, open, moves, onToggle, onAdd, onEditMove, onDeleteMove, onEditSeason }: {
  s: SeasonRow; open: boolean; moves: ManualMove[];
  onToggle: () => void; onAdd: (t: ManualMove['type']) => void; onEditMove: (m: ManualMove) => void;
  onDeleteMove: (id: string) => Promise<void>; onEditSeason: () => void;
}) {
  const g = s.gaps;
  const missingMoves = g && (!g.moves || !g.trades) && s.provider !== 'manual';
  const target = g?.counts.trades;
  const teamName = (id: number) => s.teams.find(t => t.rosterId === id)?.teamName ?? `Team ${id}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
        <span className="font-display text-xl font-bold tabular-nums text-foreground">{s.season}</span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {s.provider === 'manual' ? 'Added by you' : s.provider === 'espn' ? 'ESPN' : 'Sleeper'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {!g && <Status ok label="Complete" />}
          {g && <Status ok={g.lineups} label={g.lineups ? 'Lineups' : 'No lineups'} />}
          {missingMoves && (target === 0 && !s.entered.trades
            ? <Status ok label="No trades that season" />
            : <Status ok={target !== undefined && s.entered.trades >= target} label={target !== undefined ? `Trades: ${s.entered.trades} of ${target} added` : `${s.entered.trades} trades added`} />)}
          {missingMoves && <Status ok={false} label={`${s.entered.moves} pickup${s.entered.moves === 1 ? '' : 's'} added`} />}
          {!missingMoves && moves.length > 0 && <Status ok label={`${moves.length} added by you`} />}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {s.provider === 'manual' && (
            <button onClick={onEditSeason} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted">Edit season</button>
          )}
          {(missingMoves || moves.length > 0 || s.provider === 'manual') && (
            <button onClick={onToggle} aria-expanded={open}
              className={cn('min-h-10 sm:min-h-0 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition', open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {open ? 'Close' : missingMoves ? 'Fill in' : 'Moves'}
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="border-t border-border px-4 py-4 sm:px-5">
              {missingMoves && (
                <p className="mb-3 flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {s.gaps!.source} kept no moves for {s.season}{target !== undefined ? `, but counts ${target} trade${target === 1 ? '' : 's'}${g?.counts.moves !== undefined ? ` and ${g.counts.moves} pickups` : ''}` : ''}. Add what the league remembers; anything left out simply isn’t shown.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => onAdd('trade')} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground hover:brightness-110">
                  <ArrowLeftRight className="h-3.5 w-3.5" /> Add a trade
                </button>
                <button onClick={() => onAdd('waiver')} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-muted">
                  <UserPlus className="h-3.5 w-3.5" /> Add a pickup
                </button>
              </div>
              {moves.length > 0 && (
                <ul className="mt-4 divide-y divide-border/70 rounded-xl border border-border">
                  {moves.map(m => (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-[13px]">
                      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.week ? `Wk ${m.week}` : 'Pre'}</span>
                      <span className="min-w-0 flex-1">
                        {m.type === 'trade'
                          ? <>{teamName(m.teams[0])} <span className="text-muted-foreground">↔</span> {teamName(m.teams[1])} <span className="text-muted-foreground">· {Object.keys(m.adds).length} players</span></>
                          : <>{teamName(m.teams[0])} <span className="text-muted-foreground">{m.type === 'waiver' ? 'claimed' : 'signed'} {Object.keys(m.adds).length} player{Object.keys(m.adds).length === 1 ? '' : 's'}</span></>}
                      </span>
                      <button onClick={() => onEditMove(m)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Edit</button>
                      <button onClick={() => onDeleteMove(m.id)} className="rounded-md px-2 py-1 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-red-500">Delete</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sheets ──────────────────────────────────────────────────────────────────

function Sheet({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => { window.removeEventListener('keydown', onKey); unlock(); };
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <motion.div role="dialog" aria-modal="true" aria-label={title}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        className={cn('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl')}>
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        <div className="flex items-center gap-2 border-t border-border bg-card px-5 py-3.5 sm:px-6">{footer}</div>
      </motion.div>
    </motion.div>
  );
}

const field = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] outline-none focus:border-primary/60';
const label = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground';

/** Search the player directory and pick players; picked ones show as removable chips. */
function PlayerPicker({ picked, setPicked, search, placeholder }: {
  picked: Player[]; setPicked: (p: Player[]) => void; search: (q: string) => Promise<Player[]>; placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Player[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => search(q).then(setHits), 200);
  }, [q, search]);
  return (
    <div>
      {picked.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {picked.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-2.5 pr-1 text-[12.5px]">
              <span className="text-[10px] font-bold text-muted-foreground">{p.position}</span>{p.name}
              <button onClick={() => setPicked(picked.filter(x => x.id !== p.id))} aria-label={`Remove ${p.name}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className={field} />
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-xl">
            {hits.map(p => (
              <li key={p.id}>
                <button onClick={() => { if (!picked.some(x => x.id === p.id)) setPicked([...picked, p]); setQ(''); setHits([]); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted">
                  <span className="w-8 text-[10px] font-bold text-muted-foreground">{p.position}</span>
                  <span className="flex-1">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground">{p.team || 'FA'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MoveSheet({ season, move, initialType, search, onClose, onSave }: {
  season: SeasonRow; move?: ManualMove; initialType?: ManualMove['type']; search: (q: string) => Promise<Player[]>;
  onClose: () => void; onSave: (m: Partial<ManualMove>) => Promise<void>;
}) {
  const [type, setType] = useState<ManualMove['type']>(move?.type ?? initialType ?? 'trade');
  const [week, setWeek] = useState(move?.week ?? 1);
  const [teamA, setTeamA] = useState<number>(move?.teams[0] ?? season.teams[0]?.rosterId ?? 1);
  const [teamB, setTeamB] = useState<number>(move?.teams[1] ?? season.teams[1]?.rosterId ?? 2);
  // Players are kept with their names for the chips; an edited move's names are looked up as it loads.
  const [aGets, setAGets] = useState<Player[]>([]);
  const [bGets, setBGets] = useState<Player[]>([]);
  const [dropped, setDropped] = useState<Player[]>([]);
  const [bid, setBid] = useState(move?.waiverBid ? String(move.waiverBid) : '');
  const [note, setNote] = useState(move?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!move) return;
    // Names for an edited move's players, from the same directory search.
    const named = async (ids: string[]) => Promise.all(ids.map(async id => ({ id, name: id, position: '', team: '' })));
    const add = Object.entries(move.adds), drop = Object.entries(move.drops);
    named(add.filter(([, t]) => t === move.teams[0]).map(([id]) => id)).then(setAGets);
    named(add.filter(([, t]) => t === move.teams[1]).map(([id]) => id)).then(setBGets);
    named(drop.filter(([, t]) => t === move.teams[0] && move.type !== 'trade').map(([id]) => id)).then(setDropped);
    fetch('/api/transactions').then(r => r.json()).then(d => {
      const names = new Map<string, Player>();
      for (const t of d.transactions ?? []) for (const s of t.sides) for (const p of [...s.adds, ...s.drops]) names.set(p.id, { id: p.id, name: p.name, position: p.position, team: p.nflTeam });
      const fill = (list: Player[]) => list.map(p => names.get(p.id) ?? p);
      setAGets(fill); setBGets(fill); setDropped(fill);
    }).catch(() => {});
  }, [move]);

  const lastWeek = 18;
  const teamSelect = (value: number, set: (n: number) => void, exclude?: number) => (
    <select value={value} onChange={e => set(Number(e.target.value))} className={field}>
      {season.teams.filter(t => t.rosterId !== exclude).map(t => <option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>)}
    </select>
  );

  const save = async () => {
    setBusy(true); setError('');
    const adds: Record<string, number> = {}, drops: Record<string, number> = {};
    if (type === 'trade') {
      for (const p of aGets) { adds[p.id] = teamA; drops[p.id] = teamB; }
      for (const p of bGets) { adds[p.id] = teamB; drops[p.id] = teamA; }
    } else {
      for (const p of aGets) adds[p.id] = teamA;
      for (const p of dropped) drops[p.id] = teamA;
    }
    try {
      await onSave({
        id: move?.id, leagueId: season.leagueId, week, type,
        teams: type === 'trade' ? [teamA, teamB] : [teamA], adds, drops,
        waiverBid: type === 'waiver' && bid ? Number(bid) : undefined, note, createdAt: move?.createdAt,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); setBusy(false); }
  };

  return (
    <Sheet title={`${move ? 'Edit' : 'Add'} a ${type === 'trade' ? 'trade' : 'pickup'} · ${season.season}`}
      subtitle="Shown on Transactions, team pages and the record book, marked as added by the commissioner."
      onClose={onClose}
      footer={<>
        {error && <p className="mr-auto text-[12.5px] text-red-500">{error}</p>}
        <button onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Saving' : 'Save'}</button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={label}>Kind</span>
            <div className="flex rounded-xl border border-border bg-background p-1 text-[13px] font-semibold">
              {(['trade', 'waiver', 'free_agent'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('flex-1 rounded-lg py-1.5 transition', type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                  {t === 'trade' ? 'Trade' : t === 'waiver' ? 'Waiver' : 'Free agent'}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className={label}>Week</span>
            <select value={week} onChange={e => setWeek(Number(e.target.value))} className={field}>
              <option value={0}>Before week 1</option>
              {Array.from({ length: lastWeek }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}
            </select>
          </label>
        </div>

        {type === 'trade' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-2xl border border-border p-3.5">
              {teamSelect(teamA, setTeamA, teamB)}
              <span className={label}>Gets</span>
              <PlayerPicker picked={aGets} setPicked={setAGets} search={search} placeholder="Search players" />
            </div>
            <div className="space-y-2 rounded-2xl border border-border p-3.5">
              {teamSelect(teamB, setTeamB, teamA)}
              <span className={label}>Gets</span>
              <PlayerPicker picked={bGets} setPicked={setBGets} search={search} placeholder="Search players" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block"><span className={label}>Team</span>{teamSelect(teamA, setTeamA)}</label>
            <div><span className={label}>Picked up</span><PlayerPicker picked={aGets} setPicked={setAGets} search={search} placeholder="Search players" /></div>
            <div><span className={label}>Dropped (optional)</span><PlayerPicker picked={dropped} setPicked={setDropped} search={search} placeholder="Search players" /></div>
            {type === 'waiver' && (
              <label className="block max-w-[180px]"><span className={label}>Bid (optional)</span>
                <input inputMode="numeric" value={bid} onChange={e => setBid(e.target.value.replace(/\D/g, ''))} placeholder="$0" className={field} />
              </label>
            )}
          </div>
        )}
        <label className="block"><span className={label}>Note (optional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="The deadline-day blockbuster" maxLength={280} className={field} />
        </label>
      </div>
    </Sheet>
  );
}

// ── An older season ─────────────────────────────────────────────────────────

const NEW = '__new__';

function SeasonSheet({ initial, before, managers, taken, onClose, onSave, onDelete }: {
  initial?: ManualSeason; before: number; managers: { userId: string; name: string }[]; taken: number[];
  onClose: () => void; onSave: (s: Partial<ManualSeason>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const nextFree = (() => { let y = before - 1; while (taken.includes(y) && !initial) y--; return y; })();
  const [year, setYear] = useState(initial?.season ?? nextFree);
  const [name, setName] = useState(initial?.name ?? '');
  const [regularWeeks, setRegularWeeks] = useState(initial?.regularWeeks ?? 13);
  const [playoffTeams, setPlayoffTeams] = useState(initial?.playoffTeams ?? 4);
  const [teams, setTeams] = useState<ManualTeam[]>(initial?.teams ?? Array.from({ length: 8 }, (_, i) => ({ id: i + 1, managerId: null, managerName: '', teamName: '' })));
  const [games, setGames] = useState<ManualGame[]>(initial?.games ?? []);
  const [champion, setChampion] = useState<number | null>(initial?.champion ?? null);
  const [runnerUp, setRunnerUp] = useState<number | null>(initial?.runnerUp ?? null);
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tName = (id: number) => { const t = teams.find(x => x.id === id); return t?.teamName || t?.managerName || `Team ${id}`; };
  const setTeam = (i: number, patch: Partial<ManualTeam>) => setTeams(ts => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b);

  // Standings as the scores entered so far have them.
  const standings = useMemo(() => {
    const rec = new Map(teams.map(t => [t.id, { w: 0, l: 0, pf: 0 }]));
    for (const g of games) {
      if (g.week > regularWeeks) continue;
      const a = rec.get(g.a), b = rec.get(g.b);
      if (!a || !b) continue;
      a.pf += g.aScore; b.pf += g.bScore;
      if (g.aScore > g.bScore) { a.w++; b.l++; } else if (g.bScore > g.aScore) { b.w++; a.l++; }
    }
    return teams.map(t => ({ id: t.id, ...rec.get(t.id)! })).sort((x, y) => y.w - x.w || y.pf - x.pf);
  }, [teams, games, regularWeeks]);

  /** "week, team, score, team, score" per line, teams by name or number; a header line is skipped. */
  const importPaste = () => {
    const byName = new Map<string, number>();
    teams.forEach(t => { for (const n of [t.teamName, t.managerName, String(t.id)]) if (n) byName.set(n.trim().toLowerCase(), t.id); });
    const found: ManualGame[] = [];
    const missed: string[] = [];
    for (const line of paste.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const cells = line.split(/\t|,/).map(c => c.trim());
      if (cells.length < 5 || !/^\d+$/.test(cells[0])) { if (!/^week/i.test(cells[0] ?? '')) missed.push(line); continue; }
      const [w, ta, sa, tb, sb] = cells;
      const a = byName.get(ta.toLowerCase()), b = byName.get(tb.toLowerCase());
      if (!a || !b || Number.isNaN(Number(sa)) || Number.isNaN(Number(sb))) { missed.push(line); continue; }
      found.push({ week: Number(w), a, b, aScore: Number(sa), bScore: Number(sb) });
    }
    setGames(g => [...g, ...found].sort((x, y) => x.week - y.week));
    setPasteMsg(`${found.length} game${found.length === 1 ? '' : 's'} added${missed.length ? `; ${missed.length} line${missed.length === 1 ? '' : 's'} not understood: ${missed.slice(0, 2).join(' | ')}` : ''}.`);
    if (found.length) setPaste('');
  };

  const template = () => {
    const rows = ['week,team,score,opponent,opponent score'];
    for (let w = 1; w <= Math.min(2, regularWeeks); w++) {
      for (let i = 0; i + 1 < teams.length; i += 2) rows.push(`${w},${tName(teams[i].id)},,${tName(teams[i + 1].id)},`);
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `season-${year}-scores.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  const save = async () => {
    setBusy(true); setError('');
    try { await onSave({ season: year, name, regularWeeks, playoffTeams, teams, games, champion, runnerUp }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); setBusy(false); }
  };

  return (
    <Sheet wide title={initial ? `Season ${initial.season}` : 'Add an older season'}
      subtitle="From the league’s own records. It joins History, the record book and the rings; lineups aren’t part of it."
      onClose={onClose}
      footer={<>
        {onDelete && <button onClick={onDelete} className="rounded-xl px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-red-500">Delete season</button>}
        {error && <p className="mr-auto text-[12.5px] text-red-500">{error}</p>}
        <button onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
        <button onClick={save} disabled={busy} className="rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">{busy ? 'Saving' : 'Save season'}</button>
      </>}>
      <div className="space-y-7">
        {/* 1. The season */}
        <div className="grid gap-3 sm:grid-cols-4">
          <label><span className={label}>Year</span>
            <input type="number" value={year} disabled={Boolean(initial)} onChange={e => setYear(Number(e.target.value))} className={field} max={before - 1} />
          </label>
          <label className="sm:col-span-1"><span className={label}>Name (optional)</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="League name then" className={field} />
          </label>
          <label><span className={label}>Regular season weeks</span>
            <input type="number" min={1} max={18} value={regularWeeks} onChange={e => setRegularWeeks(Number(e.target.value))} className={field} />
          </label>
          <label><span className={label}>Playoff teams</span>
            <input type="number" min={0} max={teams.length} value={playoffTeams} onChange={e => setPlayoffTeams(Number(e.target.value))} className={field} />
          </label>
        </div>

        {/* 2. Teams */}
        <div>
          <span className={label}>Teams</span>
          <p className="-mt-0.5 mb-2.5 text-[12px] text-muted-foreground">Pick each team’s manager from the league so their all-time record includes this season.</p>
          <div className="space-y-2">
            {teams.map((t, i) => (
              <div key={t.id} className="grid grid-cols-[24px_1fr_1fr_28px] items-center gap-2">
                <span className="text-center text-[12px] font-bold text-muted-foreground">{t.id}</span>
                <select value={t.managerId ?? NEW} className={field}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === NEW) setTeam(i, { managerId: null });
                    else setTeam(i, { managerId: v, managerName: managers.find(m => m.userId === v)?.name ?? '' });
                  }}>
                  {managers.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                  <option value={NEW}>Someone else…</option>
                </select>
                {t.managerId === null ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input value={t.managerName} onChange={e => setTeam(i, { managerName: e.target.value })} placeholder="Manager’s name" className={field} />
                    <input value={t.teamName ?? ''} onChange={e => setTeam(i, { teamName: e.target.value })} placeholder="Team name" className={field} />
                  </div>
                ) : (
                  <input value={t.teamName ?? ''} onChange={e => setTeam(i, { teamName: e.target.value })} placeholder="Team name that year" className={field} />
                )}
                <button aria-label="Remove team" onClick={() => setTeams(ts => ts.filter((_, j) => j !== i).map((x, j) => ({ ...x, id: j + 1 })))}
                  className="h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" disabled={teams.length <= 2}>×</button>
              </div>
            ))}
          </div>
          <button onClick={() => setTeams(ts => [...ts, { id: ts.length + 1, managerId: null, managerName: '', teamName: '' }])}
            className="mt-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary/10">+ Add a team</button>
        </div>

        {/* 3. Results */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className={label}>Results</span>
            <button onClick={template} className="text-[12px] font-semibold text-primary hover:underline">Download a template</button>
          </div>
          <div className="rounded-2xl border border-dashed border-border p-3">
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3}
              placeholder={'Paste from a spreadsheet: week, team, score, opponent, opponent score\n1, Fight Milk FC, 112.4, Trash Pandas, 98.1'}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-primary/60" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={importPaste} disabled={!paste.trim()} className="rounded-lg bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background disabled:opacity-40">Add these games</button>
              {pasteMsg && <span className="text-[12px] text-muted-foreground">{pasteMsg}</span>}
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {weeks.map(w => (
              <div key={w} className="rounded-2xl border border-border">
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
                  <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Week {w}{w > regularWeeks ? ' · playoffs' : ''}</span>
                  <button onClick={() => setGames(gs => [...gs, { week: w, a: teams[0]?.id ?? 1, b: teams[1]?.id ?? 2, aScore: 0, bScore: 0 }])}
                    className="text-[12px] font-semibold text-primary hover:underline">+ Game</button>
                </div>
                <div className="divide-y divide-border/60">
                  {games.map((g, i) => g.week !== w ? null : (
                    <div key={i} className="grid grid-cols-[1fr_76px_16px_76px_1fr_24px] items-center gap-1.5 px-3 py-2">
                      <select value={g.a} onChange={e => setGames(gs => gs.map((x, j) => j === i ? { ...x, a: Number(e.target.value) } : x))} className={cn(field, 'h-9 text-[13px]')}>
                        {teams.map(t => <option key={t.id} value={t.id}>{tName(t.id)}</option>)}
                      </select>
                      <input inputMode="decimal" value={g.aScore} onChange={e => setGames(gs => gs.map((x, j) => j === i ? { ...x, aScore: Number(e.target.value) || 0 } : x))} className={cn(field, 'h-9 text-right tabular-nums')} />
                      <span className="text-center text-[11px] text-muted-foreground">v</span>
                      <input inputMode="decimal" value={g.bScore} onChange={e => setGames(gs => gs.map((x, j) => j === i ? { ...x, bScore: Number(e.target.value) || 0 } : x))} className={cn(field, 'h-9 tabular-nums')} />
                      <select value={g.b} onChange={e => setGames(gs => gs.map((x, j) => j === i ? { ...x, b: Number(e.target.value) } : x))} className={cn(field, 'h-9 text-[13px]')}>
                        {teams.map(t => <option key={t.id} value={t.id}>{tName(t.id)}</option>)}
                      </select>
                      <button aria-label="Remove game" onClick={() => setGames(gs => gs.filter((_, j) => j !== i))} className="h-8 rounded-lg text-muted-foreground hover:bg-muted">×</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => { const w = (weeks[weeks.length - 1] ?? 0) + 1; setGames(gs => [...gs, { week: w, a: teams[0]?.id ?? 1, b: teams[1]?.id ?? 2, aScore: 0, bScore: 0 }]); }}
              className="w-full rounded-xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:border-primary/50 hover:text-foreground">
              + Add week {(weeks[weeks.length - 1] ?? 0) + 1}
            </button>
          </div>
        </div>

        {/* 4. Champion, and the standings the scores give */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="block"><span className={label}>Champion</span>
              <select value={champion ?? ''} onChange={e => setChampion(e.target.value ? Number(e.target.value) : null)} className={field}>
                <option value="">Not decided</option>
                {teams.map(t => <option key={t.id} value={t.id}>{tName(t.id)}</option>)}
              </select>
            </label>
            <label className="block"><span className={label}>Runner-up</span>
              <select value={runnerUp ?? ''} onChange={e => setRunnerUp(e.target.value ? Number(e.target.value) : null)} className={field}>
                <option value="">Not decided</option>
                {teams.filter(t => t.id !== champion).map(t => <option key={t.id} value={t.id}>{tName(t.id)}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className={label}>Standings so far</span>
            <ol className="rounded-2xl border border-border text-[13px]">
              {standings.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 border-b border-border/60 px-3.5 py-1.5 last:border-0">
                  <span className="w-4 text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{tName(s.id)}{s.id === champion && <Trophy className="ml-1.5 inline h-3.5 w-3.5 text-amber-500" />}</span>
                  <span className="tabular-nums text-muted-foreground">{s.w}-{s.l}</span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">{s.pf.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
