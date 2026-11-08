'use client';

/**
 * The admin panel's Trophy tab: the league's trophy, designed. Its name (engraved on the plaque),
 * metal, base, what crowns it, its handles, the colour it glows and the effects round it, with
 * the trophy itself turning beside the choices as they change, every real champion on its base.
 * Saved for the whole league (api/trophy): the History page, League Wrapped and full screen all
 * show it.
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import {
  cleanTrophyStyle, DEFAULT_TROPHY, TROPHY_BASES, TROPHY_CROWNS, TROPHY_HANDLES, TROPHY_LABELS, TROPHY_METALS, type TrophyStyle,
} from '@/lib/trophyStyle';

const TrophyPreview = dynamic(() => import('@/components/trophies/Forge').then(m => m.TrophyPreview), {
  ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-muted/40" />,
});

function Choice<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={cn('min-h-[36px] rounded-lg border px-3 text-[13px] font-semibold transition-colors',
              value === o ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground hover:border-primary/40')}>
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[36px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 text-[13px] font-semibold">
      {label}
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
    </label>
  );
}

export default function TrophyAdmin({ adminPassword, leagueName }: { adminPassword: string; leagueName: string }) {
  const [style, setStyle] = useState<TrophyStyle | null>(null);
  const [saved, setSaved] = useState<TrophyStyle | null>(null);
  const [champions, setChampions] = useState<{ season: string; name: string }[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/trophy', { cache: 'no-store' }).then(r => r.json()).then(d => { const s = cleanTrophyStyle(d?.style); setStyle(s); setSaved(s); })
      .catch(() => { setStyle(DEFAULT_TROPHY); setSaved(DEFAULT_TROPHY); });
    // The real champions, for the plates on the preview.
    fetch('/api/wrapped?season=all').then(r => r.json())
      .then(d => setChampions((d?.wrapped?.league?.champions ?? []).map((c: { season: number; name: string }) => ({ season: String(c.season), name: c.name }))))
      .catch(() => {});
  }, []);

  const dirty = useMemo(() => JSON.stringify(style) !== JSON.stringify(saved), [style, saved]);
  if (!style) return <div className="h-64 animate-pulse rounded-xl bg-muted/40" />;
  const set = (patch: Partial<TrophyStyle>) => { setStyle(s => ({ ...s!, ...patch })); setStatus(null); };

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      const r = await fetch('/api/trophy', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword }, body: JSON.stringify({ style }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setStyle(d.style); setSaved(d.style);
      setStatus({ ok: true, text: 'Saved. The trophy is updated everywhere it appears.' });
    } catch (e) { setStatus({ ok: false, text: e instanceof Error ? e.message : 'Could not save.' }); }
    setSaving(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">The trophy</h2>
          <p className="mt-1 text-sm text-muted-foreground">What your champions lift. It shows on the History page, in League Wrapped and full screen, with every champion engraved on a plate round the base.</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Its name, engraved on the plaque</span>
          <input value={style.name} maxLength={40} onChange={e => set({ name: e.target.value })} placeholder={leagueName}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        </label>
        <Choice label="Metal" options={TROPHY_METALS} labels={TROPHY_LABELS.metal} value={style.metal} onChange={metal => set({ metal })} />
        <Choice label="Base" options={TROPHY_BASES} labels={TROPHY_LABELS.base} value={style.base} onChange={base => set({ base })} />
        <Choice label="Crowned with" options={TROPHY_CROWNS} labels={TROPHY_LABELS.crown} value={style.crown} onChange={crown => set({ crown })} />
        <Choice label="Handles" options={TROPHY_HANDLES} labels={TROPHY_LABELS.handles} value={style.handles} onChange={handles => set({ handles })} />
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">Glow</legend>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => set({ glow: 'league' })} aria-pressed={style.glow === 'league'}
              className={cn('min-h-[36px] rounded-lg border px-3 text-[13px] font-semibold', style.glow === 'league' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40')}>
              League colour
            </button>
            {['#3BE0B0', '#7C5CFF', '#FF4D6D', '#FFB020', '#4DB8FF'].map(c => (
              <button key={c} type="button" onClick={() => set({ glow: c.toLowerCase() })} aria-label={`Glow ${c}`} aria-pressed={style.glow === c.toLowerCase()}
                className={cn('h-9 w-9 rounded-full border-2', style.glow === c.toLowerCase() ? 'border-foreground' : 'border-transparent')} style={{ background: c, boxShadow: `0 0 12px ${c}88` }} />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2 text-[12px] font-semibold text-muted-foreground">
              Any
              <input type="color" value={style.glow === 'league' ? '#3be0b0' : style.glow} onChange={e => set({ glow: e.target.value.toLowerCase() })} className="h-6 w-8 cursor-pointer bg-transparent" />
            </label>
          </div>
        </fieldset>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle label="Orbiting rings" value={style.orbits} onChange={orbits => set({ orbits })} />
          <Toggle label="Rising light" value={style.motes} onChange={motes => set({ motes })} />
          <Toggle label="Rune circle" value={style.runes} onChange={runes => set({ runes })} />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button type="button" onClick={save} disabled={!dirty || saving}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {saving ? 'Saving…' : 'Save trophy'}
          </button>
          <button type="button" onClick={() => { setStyle(DEFAULT_TROPHY); setStatus(null); }} className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Back to the original
          </button>
          {status && <span className={cn('text-[13px]', status.ok ? 'text-primary' : 'text-red-500')}>{status.text}</span>}
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <TrophyPreview league={leagueName} champions={champions} style={style} height={460} />
        <p className="mt-2 text-center text-xs text-muted-foreground">Drag to turn it. {champions.length ? `${champions.length} champion${champions.length === 1 ? '' : 's'} on the base.` : 'Champions appear on the base as they win.'}</p>
      </div>
    </div>
  );
}
