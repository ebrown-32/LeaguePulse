'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Shirt } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import Avatar from '@/components/ui/Avatar';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { LoadingPage, LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SeasonSelect } from '@/components/ui/SeasonSelect';
import { cn } from '@/lib/utils';
import { POSITION_STYLE } from './positions';
import PlayerDetailModal from './PlayerDetailModal';
import type { PlayerCard } from '@/lib/playerStats';

interface RosterTeam {
  rosterId: number;
  userId: string;
  teamName: string;
  managerName: string;
  avatar: string;
  record: { wins: number; losses: number; ties: number };
  starters: PlayerCard[];
  bench: PlayerCard[];
}

function PlayerRow({ player, onOpen, best }: { player: PlayerCard; onOpen: () => void; best: number }) {
  const style = POSITION_STYLE[player.position] ?? POSITION_STYLE.DEFAULT;
  // Production bar is relative to the best scorer on this roster, so the
  // shape of a team's depth is readable at a glance.
  const pct = player.points != null && best > 0 ? Math.max(4, (player.points / best) * 100) : 0;

  return (
    <button
      onClick={onOpen}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40"
    >
      {/* production bar, sunk behind the content */}
      <span
        className={cn('pointer-events-none absolute inset-y-0 left-0 opacity-[0.09] transition-opacity group-hover:opacity-[0.16]', style.bar)}
        style={{ width: `${pct}%` }}
      />

      <span className={cn('relative flex h-8 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold tracking-wider', style.badge)}>
        {player.position}
      </span>

      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {player.name}
          </span>
          {player.injuryStatus && (
            <span className="shrink-0 rounded border border-rose-500/25 bg-rose-500/10 px-1 py-px text-[8px] font-bold uppercase tracking-widest text-rose-500">
              {player.injuryStatus}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {player.nflTeam}
          {player.number && <> · #{player.number}</>}
          {player.positionRank != null && <> · {player.position}{player.positionRank}</>}
        </span>
      </span>

      <span className="relative shrink-0 text-right">
        <span className="block font-display text-base font-bold tabular-nums text-foreground">
          {player.points != null ? player.points.toFixed(1) : '—'}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {player.pointsPerGame != null ? `${player.pointsPerGame.toFixed(1)}/gm` : 'no games'}
        </span>
      </span>
    </button>
  );
}

function RosterSection({
  title, players, best, onOpen,
}: { title: string; players: PlayerCard[]; best: number; onOpen: (p: PlayerCard) => void }) {
  if (!players.length) return null;
  const total = players.reduce((s, p) => s + (p.points ?? 0), 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title} <span className="text-muted-foreground/60">({players.length})</span>
        </h2>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {total.toFixed(1)} pts
        </span>
      </div>
      <div className="space-y-2">
        {players.map((p, i) => (
          <motion.div
            key={p.playerId}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(i, 12) * 0.02 }}
          >
            <PlayerRow player={p} best={best} onOpen={() => onOpen(p)} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function RostersView() {
  const [teams, setTeams] = useState<RosterTeam[]>([]);
  const [statsSeason, setStatsSeason] = useState('');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [switching, setSwitching] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPlayer, setOpenPlayer] = useState<PlayerCard | null>(null);

  const load = useCallback((season?: string) => {
    const params = season ? `?season=${season}` : '';
    return fetch(`/api/rosters${params}`).then(r => r.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then(d => {
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setTeams(d.teams);
        setSeasons(d.seasons ?? []);
        setStatsSeason(d.statsSeason);
        setSelected(prev => prev ?? d.teams[0]?.userId ?? null);
      })
      .catch(() => !cancelled && setError('Failed to load rosters'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [load]);

  // The roster itself never changes — only the production laid over it — so
  // the selected manager always survives a season switch.
  const changeSeason = useCallback((season: string) => {
    setSwitching(true);
    setStatsSeason(season);
    load(season)
      .then(d => {
        if (d.error) return;
        setTeams(d.teams);
        setStatsSeason(d.statsSeason);
      })
      .catch(() => {})
      .finally(() => setSwitching(false));
  }, [load]);

  const team = useMemo(() => teams.find(t => t.userId === selected) ?? null, [teams, selected]);
  const best = useMemo(
    () => (team ? Math.max(...[...team.starters, ...team.bench].map(p => p.points ?? 0), 0) : 0),
    [team],
  );

  if (loading) return <LoadingPage />;
  if (error)   return <ErrorMessage title="Error" message={error} />;

  return (
    <PageLayout
      title="Rosters"
      subtitle={`Current rosters, showing ${statsSeason} production and full move history.`}
    >
      {/* Season picker */}
      {seasons.length > 1 && (
        <div className="mb-5 flex items-center gap-3">
          <SeasonSelect
            seasons={seasons}
            selectedSeason={statsSeason}
            onSeasonChange={changeSeason}
            includeAllTime={false}
          />
          {switching && <LoadingSpinner className="h-4 w-4" />}
        </div>
      )}

      {/* Team selector */}
      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
        {teams.map(t => {
          const isActive = t.userId === selected;
          return (
            <button
              key={t.userId}
              onClick={() => setSelected(t.userId)}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Avatar avatarId={t.avatar} size={22} className="rounded-full" />
              {t.teamName}
            </button>
          );
        })}
      </div>

      {team && (
        <>
          {/* Team header */}
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
            <Avatar avatarId={team.avatar} size={52} className="shrink-0 rounded-xl ring-2 ring-primary/30" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-bold text-foreground">{team.teamName}</h2>
              <p className="text-xs text-muted-foreground">
                {team.managerName}
                {' · '}
                {team.record.wins}-{team.record.losses}
                {team.record.ties ? `-${team.record.ties}` : ''}
                {' · '}
                {team.starters.length + team.bench.length} players
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RosterSection title="Starters" players={team.starters} best={best} onOpen={setOpenPlayer} />
            <RosterSection title="Bench"    players={team.bench}    best={best} onOpen={setOpenPlayer} />
          </div>
        </>
      )}

      <PlayerDetailModal
        playerId={openPlayer?.playerId ?? null}
        fallback={openPlayer}
        season={statsSeason}
        onClose={() => setOpenPlayer(null)}
      />
    </PageLayout>
  );
}
