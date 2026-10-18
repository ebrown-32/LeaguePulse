'use client';

/**
 * What a franchise's official post shows under its text (lib/franchise/announce): a stadium
 * photograph, developed from the real 3D stadium like the desk's (StadiumPhoto); a promotion
 * night's poster laid over one; a ticket for new prices; the new logo.
 */

import StadiumPhoto from './StadiumPhoto';
import { initialsOf, playerPhoto } from '@/lib/playerPhoto';
import type { PhotoSpec } from '@/lib/franchise/photo';

type PromoId = 'beer' | 'fireworks' | 'bobblehead';
export type OfficialVisual =
  | { type: 'photo'; photo: PhotoSpec }
  | { type: 'promo'; promo: PromoId; photo: PhotoSpec; when: string; opponent: string | null; color: string; stadium: string }
  | { type: 'ticket'; ticket: number; was: number | null; color: string; stadium: string; team: string; opponent: string | null; when: string }
  | { type: 'logo'; url: string; color: string; team: string }
  | { type: 'player'; playerId: string; name: string; position: string; nflTeam: string; points: number; line: string; color: string; team: string }
  | { type: 'final'; week: number; us: Side; them: Side };
type Side = { name: string; score: number; color: string; avatar: string | null };

export default function OfficialVisualView({ visual, team }: { visual: OfficialVisual | null | undefined; team: string }) {
  if (!visual) return null;
  switch (visual.type) {
    case 'photo': return <StadiumPhoto spec={visual.photo} hostTeam={team} />;
    case 'promo': return <PromoPoster v={visual} team={team} />;
    case 'ticket': return <Ticket v={visual} />;
    case 'logo': return <LogoReveal v={visual} />;
    case 'player': return <PlayerCard v={visual} />;
    case 'final': return <FinalBoard v={visual} />;
  }
}

const HEADLINE: Record<PromoId, [string, string]> = {
  beer: ['$1', 'Beer Night'],
  fireworks: ['Fireworks', 'Night'],
  bobblehead: ['Bobblehead', 'Giveaway'],
};

/** The promotion's poster, over a photo from the stadium (the tailgates, for beer night). */
function PromoPoster({ v, team }: { v: Extract<OfficialVisual, { type: 'promo' }>; team: string }) {
  const [big, small] = HEADLINE[v.promo];
  return (
    <div className="relative mt-2.5 aspect-[16/10] overflow-hidden rounded-2xl border border-border"
      style={{ background: `linear-gradient(135deg, ${v.color}, #0b0f14)` }}>
      <div className="absolute inset-0">
        <StadiumPhoto spec={v.photo} hostTeam={team} className="mt-0 h-full rounded-none border-0" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 flex w-[62%] flex-col justify-center p-4 text-white sm:p-6">
        <span className="w-fit px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em]" style={{ background: v.color }}>One night only</span>
        <p className="mt-2 font-display text-[40px] font-black uppercase leading-[0.85] tracking-tight drop-shadow sm:text-[64px]">{big}</p>
        <p className="font-display text-[22px] font-black uppercase leading-none tracking-tight sm:text-[34px]">{small}</p>
        <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/85 sm:text-[13px]">
          {v.when}{v.opponent ? ` · vs ${v.opponent}` : ''}
        </p>
        <p className="mt-0.5 text-[11px] text-white/65 sm:text-[12px]">{v.stadium}</p>
      </div>
      <div className="pointer-events-none absolute bottom-0 right-[4%] h-[86%] w-[34%] drop-shadow-[0_12px_30px_rgba(0,0,0,0.55)]">
        {v.promo === 'beer' ? <Pint color={v.color} /> : v.promo === 'fireworks' ? <Fireworks color={v.color} /> : <Bobblehead color={v.color} />}
      </div>
    </div>
  );
}

/** A frosty pint with a one dollar tag. */
function Pint({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 170" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="lager" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f59e0b" /><stop offset="0.5" stopColor="#fbbf24" /><stop offset="1" stopColor="#d97706" /></linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0.45" /><stop offset="0.2" stopColor="#fff" stopOpacity="0.08" /><stop offset="1" stopColor="#fff" stopOpacity="0.25" /></linearGradient>
      </defs>
      <path d="M22 40 L98 40 L90 160 Q60 168 30 160 Z" fill="url(#lager)" />
      {[[40, 140, 2.5], [52, 118, 2], [70, 132, 3], [80, 96, 2], [46, 84, 2.5], [64, 70, 1.8], [76, 150, 2.2]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity="0.55" />
      ))}
      <path d="M16 44 Q14 24 34 26 Q40 10 60 16 Q78 8 88 24 Q108 22 104 44 Q60 54 16 44 Z" fill="#fffbeb" />
      <path d="M22 40 L98 40 L90 160 Q60 168 30 160 Z" fill="url(#glass)" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      <g transform="rotate(-14 96 120)">
        <circle cx="96" cy="120" r="21" fill={color} stroke="#fff" strokeWidth="3" />
        <text x="96" y="128" textAnchor="middle" fontSize="22" fontWeight="900" fill="#fff" fontFamily="Arial Black, Arial, sans-serif">$1</text>
      </g>
    </svg>
  );
}

/** Bursts over the bowl. */
function Fireworks({ color }: { color: string }) {
  const burst = (cx: number, cy: number, r: number, c: string) => (
    <g key={`${cx}${cy}`}>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return <line key={i} x1={cx + Math.cos(a) * r * 0.25} y1={cy + Math.sin(a) * r * 0.25} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke={c} strokeWidth="3" strokeLinecap="round" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.12} fill="#fff" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 170" className="h-full w-full" aria-hidden>
      {burst(60, 50, 40, '#fde68a')}
      {burst(28, 100, 26, color)}
      {burst(92, 112, 22, '#fff')}
      <path d="M60 170 Q58 120 60 90 M28 170 Q30 140 28 126 M92 170 Q90 146 92 134" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.5" fill="none" strokeDasharray="3 4" />
    </svg>
  );
}

/** A bobblehead in the team's jersey. */
function Bobblehead({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 170" className="h-full w-full" aria-hidden>
      <ellipse cx="60" cy="160" rx="40" ry="8" fill="#1f2937" />
      <rect x="22" y="146" width="76" height="14" rx="3" fill="#374151" />
      <path d="M40 146 L44 104 Q60 96 76 104 L80 146 Z" fill={color} />
      <text x="60" y="132" textAnchor="middle" fontSize="18" fontWeight="900" fill="#fff" fontFamily="Arial Black, Arial, sans-serif">1</text>
      <rect x="54" y="88" width="12" height="14" fill="#e0b48a" />
      <circle cx="60" cy="56" r="38" fill="#e8bf94" />
      <path d="M22 52 Q24 16 60 16 Q96 16 98 52 Q80 34 60 36 Q40 34 22 52 Z" fill={color} />
      <rect x="22" y="48" width="76" height="6" rx="3" fill={color} />
      <circle cx="46" cy="60" r="4.5" fill="#111827" /><circle cx="74" cy="60" r="4.5" fill="#111827" />
      <path d="M44 76 Q60 90 76 76" stroke="#111827" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A ticket for the next home game, at the new price. */
function Ticket({ v }: { v: Extract<OfficialVisual, { type: 'ticket' }> }) {
  return (
    <div className="mt-2.5 flex overflow-hidden rounded-2xl border border-border text-white shadow-sm" style={{ background: `linear-gradient(120deg, ${v.color}, #0b0f14 85%)` }}>
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/70">Admit one · General admission</p>
        <p className="mt-1.5 truncate font-display text-[22px] font-black uppercase leading-none sm:text-[28px]">{v.team}</p>
        <p className="mt-1 text-[12.5px] text-white/80">{v.when}{v.opponent ? ` vs ${v.opponent}` : ''}</p>
        <p className="text-[12px] text-white/60">{v.stadium}</p>
      </div>
      <div className="relative flex w-[34%] max-w-[150px] flex-col items-center justify-center border-l-2 border-dashed border-white/35 bg-black/25 p-3">
        <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" />
        <span className="absolute -bottom-2.5 -left-2.5 h-5 w-5 rounded-full bg-background" />
        {v.was != null && v.was !== v.ticket && <span className="text-[13px] text-white/55 line-through tabular-nums">${v.was}</span>}
        <span className="font-display text-[34px] font-black leading-none tabular-nums sm:text-[40px]">${v.ticket}</span>
        <span className="mt-2 h-6 w-full max-w-[96px] opacity-80" style={{ background: 'repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 4px, #fff 4px 5px, transparent 5px 8px)' }} />
      </div>
    </div>
  );
}

/** The new logo, unveiled on the team's color. */
function LogoReveal({ v }: { v: Extract<OfficialVisual, { type: 'logo' }> }) {
  return (
    <div className="relative mt-2.5 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl border border-border"
      style={{ background: `radial-gradient(circle at 50% 45%, ${v.color}, #0b0f14 75%)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={v.url} alt={`${v.team}'s new logo`} className="h-[58%] w-auto rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.3em] text-white/75">The new look</span>
    </div>
  );
}

/** A player's big day: his photo on the team's color, his points, his line. */
function PlayerCard({ v }: { v: Extract<OfficialVisual, { type: 'player' }> }) {
  const photo = playerPhoto({ playerId: v.playerId, position: v.position, nflTeam: v.nflTeam });
  return (
    <div className="relative mt-2.5 flex aspect-[16/9] overflow-hidden rounded-2xl border border-border text-white"
      style={{ background: `linear-gradient(115deg, ${v.color} 0%, #0b0f14 78%)` }}>
      <div className="pointer-events-none absolute -left-10 top-1/2 -translate-y-1/2 font-display text-[180px] font-black leading-none text-white/[0.06] sm:text-[240px]">
        {Math.round(v.points)}
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center p-4 sm:p-6">
        <span className="w-fit bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-black">Big day</span>
        <p className="mt-2 truncate font-display text-[24px] font-black uppercase leading-[0.95] sm:text-[34px]">{v.name}</p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{v.position} · {v.nflTeam} · {v.team}</p>
        <p className="mt-3 font-display text-[44px] font-black leading-none tabular-nums sm:text-[60px]">{v.points.toFixed(1)}<span className="ml-1.5 text-[14px] font-bold uppercase tracking-wider text-white/70 sm:text-[16px]">pts</span></p>
        {v.line && <p className="mt-1.5 text-[12.5px] text-white/85 sm:text-[14px]">{v.line}</p>}
      </div>
      <div className="relative flex w-[42%] items-end justify-center">
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt={v.name} className={v.position === 'DEF' ? 'mb-[18%] h-[56%] w-auto drop-shadow-xl' : 'h-[96%] w-auto object-contain object-bottom drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]'} />
          : <span className="mb-[24%] font-display text-[56px] font-black text-white/80">{initialsOf(v.name)}</span>}
      </div>
    </div>
  );
}

/** A final score, broadcast style: both teams, the winner lit. */
function FinalBoard({ v }: { v: Extract<OfficialVisual, { type: 'final' }> }) {
  const won = v.us.score > v.them.score, lost = v.us.score < v.them.score;
  const row = (s: Side, lit: boolean) => (
    <div className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${lit ? '' : 'opacity-60'}`}>
      <span className="h-9 w-1.5 shrink-0" style={{ background: s.color }} />
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[12px] font-bold">
        {initialsOf(s.name)}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.avatar && <img src={s.avatar} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-display text-[17px] font-bold sm:text-[20px]">{s.name}</span>
      <span className="font-display text-[28px] font-black tabular-nums sm:text-[34px]">{s.score.toFixed(1)}</span>
    </div>
  );
  return (
    <div className="mt-2.5 overflow-hidden rounded-2xl border border-border bg-[#0b0f14] text-white">
      <div className="flex items-center justify-between px-4 pt-3 text-[10.5px] font-black uppercase tracking-[0.24em] sm:px-5">
        <span className="bg-white px-2 py-0.5 text-black">Final</span>
        <span className="text-white/55">Week {v.week}</span>
      </div>
      {row(v.us, won || (!won && !lost))}
      <div className="mx-4 h-px bg-white/10 sm:mx-5" />
      {row(v.them, lost || (!won && !lost))}
    </div>
  );
}
