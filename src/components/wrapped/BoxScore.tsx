'use client';

/**
 * A game's box score (lib/wrapped/engine boxScore): both teams, their final scores, and their
 * lineups slot by slot, each player with his photo and points. The game's top scorer is lit.
 * `tone="stage"` for League Wrapped's dark stage, `"page"` for the site's own pages.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import { cn } from '@/lib/utils';
import type { BoxScore as Box, BoxSide, PlayerRef } from '@/lib/wrapped/engine';

const lastName = (n: string) => (n.endsWith(' Defense') ? n.replace(' Defense', ' D') : n.split(' ').slice(-1)[0]);

function Face({ p, size = 26 }: { p: PlayerRef; size?: number }) {
  const [ok, setOk] = useState(true);
  const src = playerPhoto({ playerId: p.id, position: p.position ?? '', nflTeam: p.team });
  return (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/20 text-[9px] font-bold" style={{ width: size, height: size }}>
      {initialsOf(p.name)}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && ok && <img src={src} alt="" loading="lazy" onError={() => setOk(false)} className={cn('absolute inset-0 h-full w-full', p.position === 'DEF' ? 'object-contain p-0.5' : 'object-cover object-top')} />}
    </span>
  );
}

export default function BoxScore({ box, tone = 'page', className }: { box: Box; tone?: 'stage' | 'page'; className?: string }) {
  const stage = tone === 'stage';
  const rows = Math.max(box.winner.lineup.length, box.loser.lineup.length);
  const all = [...box.winner.lineup, ...box.loser.lineup];
  const max = Math.max(1, ...all.map(x => x.pts));
  const top = all.reduce((b, x) => (x.player && x.pts > (b?.pts ?? -1) ? x : b), null as (typeof all)[number] | null);
  const muted = stage ? 'text-white/55' : 'text-muted-foreground';

  const header = (s: BoxSide, won: boolean, right: boolean) => (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-2.5', right && 'flex-row-reverse text-right',
      won && !box.tie ? (stage ? 'bg-white/[0.12] ring-1 ring-[hsl(var(--primary))]' : 'bg-primary/10 ring-1 ring-primary/40') : stage ? 'bg-white/[0.05]' : 'bg-muted/50')}>
      <Avatar avatarId={s.avatar} size={34} className="shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold leading-tight [overflow-wrap:anywhere]">{s.name}</p>
        <p className={cn('text-[22px] font-black tabular-nums leading-none tracking-tight', won && !box.tie && 'text-[hsl(var(--primary))]')}>{s.pts.toFixed(1)}</p>
      </div>
    </div>
  );

  const cell = (x: Box['winner']['lineup'][number] | undefined, right: boolean, k: number) => {
    if (!x?.player) return <span className={cn('text-[11px]', muted, right && 'text-right')}>Empty</span>;
    const lit = x === top;
    // The name on its own line, the bar and points under it: room for the whole name on a phone.
    return (
      <div className={cn('flex min-w-0 items-center gap-1.5', right && 'flex-row-reverse text-right')}>
        <Face p={x.player} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[12px] font-semibold leading-tight [overflow-wrap:anywhere]', lit && 'text-[hsl(var(--primary))]')}>{lastName(x.player.name)}</p>
          <div className={cn('mt-1 flex items-center gap-1.5', right && 'flex-row-reverse')}>
            <div className={cn('h-[3px] min-w-0 flex-1 overflow-hidden rounded-full', stage ? 'bg-white/10' : 'bg-muted')}>
              <motion.div className={cn('h-full rounded-full', right && 'ml-auto')} style={{ background: lit ? 'hsl(var(--primary))' : stage ? 'rgba(255,255,255,0.6)' : 'hsl(var(--muted-foreground) / 0.6)' }}
                initial={{ width: 0 }} animate={{ width: `${Math.max(3, (x.pts / max) * 100)}%` }} transition={{ delay: 0.25 + k * 0.05, duration: 0.6 }} />
            </div>
            <span className="shrink-0 text-[12.5px] font-bold leading-none tabular-nums tracking-tight">{x.pts.toFixed(1)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('w-full', stage ? 'text-white' : 'text-foreground', className)}>
      <div className="flex items-stretch gap-2">
        {header(box.winner, true, false)}
        <div className="flex shrink-0 flex-col items-center justify-center px-0.5">
          <span className={cn('text-[10px] font-bold uppercase tracking-widest', muted)}>{box.tie ? 'tie' : 'by'}</span>
          <span className="text-[14px] font-black tabular-nums tracking-tight">{(box.winner.pts - box.loser.pts).toFixed(box.winner.pts - box.loser.pts < 1 ? 2 : 1)}</span>
        </div>
        {header(box.loser, false, true)}
      </div>
      <ul className={cn('mt-2.5 divide-y overflow-hidden rounded-2xl', stage ? 'divide-white/[0.07] bg-white/[0.05]' : 'divide-border border border-border bg-card')}>
        {Array.from({ length: rows }, (_, k) => {
          const a = box.winner.lineup[k], b = box.loser.lineup[k];
          return (
            <motion.li key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + k * 0.05 }}
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-2 py-1.5">
              {cell(a, false, k)}
              <span className={cn('w-11 rounded-md py-0.5 text-center text-[9.5px] font-black uppercase tracking-wider', stage ? 'bg-white/10 text-white/70' : 'bg-muted text-muted-foreground')}>{(a ?? b)?.slot.replace('SUPER_FLEX', 'SFLX').replace('WRRB_FLEX', 'W/R').replace('REC_FLEX', 'W/T')}</span>
              {cell(b, true, k)}
            </motion.li>
          );
        })}
      </ul>
      <p className={cn('mt-2 text-center text-[11px]', muted)}>Week {box.week}, {box.season}. Starting lineups.</p>
    </div>
  );
}
