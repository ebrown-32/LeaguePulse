'use client';

/**
 * How a trade is drawn, shared by the Transactions page and the simulator's
 * Alternate Timelines.
 *
 * Lifted out of `TransactionsView` when Timelines needed the same thing. A
 * trade is directional, and the simulator was showing it as a flat list of
 * names, which told you who moved but not which way, in a tool whose entire
 * subject is what happens when you send them back.
 */

import { TrendingUp, TrendingDown } from 'lucide-react';
import TeamLink from '@/components/ui/TeamLink';
import { cn } from '@/lib/utils';
import type {
  PlayerSummary, DraftPickSummary, TransactionSide,
} from '@/app/api/transactions/route';

const POS_COLOR: Record<string, string> = {
  QB:  'bg-amber-400/10 text-amber-400 border-amber-400/30',
  RB:  'bg-emerald-400/10 text-emerald-400 border-emerald-400/30',
  WR:  'bg-sky-400/10 text-sky-400 border-sky-400/30',
  TE:  'bg-violet-400/10 text-violet-400 border-violet-400/30',
  K:   'bg-slate-400/10 text-slate-400 border-slate-400/30',
  DEF: 'bg-rose-400/10 text-rose-400 border-rose-400/30',
};

export function PosTag({ pos }: { pos: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide',
      POS_COLOR[pos] ?? 'bg-muted text-muted-foreground border-border',
    )}>
      {pos}
    </span>
  );
}

export function PickTag({ pick }: { pick: DraftPickSummary }) {
  return (
    <span className="inline-flex items-center rounded border border-purple-400/30 bg-purple-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-400">
      &apos;{pick.season.slice(2)} R{pick.round} Pick
    </span>
  );
}

export function PlayerRow({ player, variant }: {
  player: PlayerSummary;
  variant: 'add' | 'drop' | 'neutral';
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {variant === 'add'  && <TrendingUp   className="h-3 w-3 shrink-0 text-emerald-400" />}
      {variant === 'drop' && <TrendingDown className="h-3 w-3 shrink-0 text-rose-400"   />}
      {variant === 'neutral' && <div className="h-3 w-3 shrink-0" />}
      <PosTag pos={player.position} />
      <span className="text-sm font-medium leading-none text-foreground">{player.name}</span>
      <span className="text-[10px] font-medium text-muted-foreground/60">{player.nflTeam}</span>
    </div>
  );
}

/**
 * Both halves of a trade, each with what that team received.
 *
 * `compact` drops the team link to a plain label and tightens the type, for use
 * inside a list row rather than as a standalone card.
 */
export function TradeSides({ sides, compact = false, linkTeams = true }: {
  sides: TransactionSide[];
  compact?: boolean;
  /** Off inside a button, where a nested anchor is invalid HTML. */
  linkTeams?: boolean;
}) {
  const [a, b] = sides;
  if (!a || !b) return null;

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-border/50">
        {[a, b].map(side => (
          <Side key={side.rosterId} side={side} compact={compact} linkTeams={linkTeams} />
        ))}
      </div>

      {/* Three and four way trades: the extra sides stack underneath. */}
      {sides.slice(2).map(side => (
        <div key={side.rosterId} className="border-t border-border/40 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1">
            <TeamHeading side={side} compact={compact} linkTeams={linkTeams} />
            <span className="text-xs font-semibold text-foreground">also gets</span>
          </div>
          <Gets side={side} />
        </div>
      ))}
    </>
  );
}

function Side({ side, compact, linkTeams }: {
  side: TransactionSide; compact: boolean; linkTeams: boolean;
}) {
  return (
    <div className={cn(compact ? 'px-3 pb-2.5 pt-2' : 'px-4 pb-4')}>
      <TeamHeading side={side} compact={compact} linkTeams={linkTeams} />
      <p className="mb-1 mt-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
        Gets
      </p>
      <Gets side={side} />
    </div>
  );
}

function TeamHeading({ side, compact, linkTeams }: {
  side: TransactionSide; compact: boolean; linkTeams: boolean;
}) {
  if (!linkTeams) {
    // Plain, non-interactive rendering. TeamLink emits an anchor, and this is
    // used inside a button on the simulator, where nesting one is invalid.
    return (
      <div className="flex items-center gap-1.5">
        <img
          src={side.avatar
            ? (/^https?:\/\//.test(side.avatar) ? side.avatar : `https://sleepercdn.com/avatars/${side.avatar}`)
            : 'https://sleepercdn.com/images/v2/icons/player-default.webp'}
          alt=""
          width={compact ? 18 : 20}
          height={compact ? 18 : 20}
          className="shrink-0 rounded-full ring-1 ring-border"
        />
        <span className="line-clamp-1 text-xs font-semibold leading-tight text-foreground">
          {side.teamName}
        </span>
      </div>
    );
  }
  return (
    <TeamLink
      userId={side.userId}
      teamName={side.teamName}
      avatar={side.avatar}
      avatarSize={compact ? 18 : 20}
      textClassName="text-xs font-semibold text-foreground leading-tight line-clamp-1"
    />
  );
}

function Gets({ side }: { side: TransactionSide }) {
  const nothing = side.adds.length === 0 && side.picksIn.length === 0;
  return (
    <div className="space-y-0.5">
      {side.adds.map(p => <PlayerRow key={p.id} player={p} variant="neutral" />)}
      {side.picksIn.map((pk, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div className="h-3 w-3 shrink-0" />
          <PickTag pick={pk} />
        </div>
      ))}
      {nothing && <span className="text-xs italic text-muted-foreground/30">-</span>}
    </div>
  );
}
