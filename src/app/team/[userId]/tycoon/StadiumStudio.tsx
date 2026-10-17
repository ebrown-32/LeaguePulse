'use client';

/**
 * The stadium studio, on the manager's page: the stadium's name, its style
 * and how it is dressed, previewed live in the 3D view above as each choice is
 * made and saved together. Free, and only for show: the economy never sees it.
 * Except Build, which is the economy: the upgrades, each shown on the stadium
 * before it's bought and built from the same place (FranchiseHQ builds it).
 *
 *   Build         the upgrades, with the VC to buy them
 *   Stadium       the style, with a plan of each one drawn at the franchise's
 *                 own build, how the upgrades build out in it, and its roof
 *   Colors        the accent, seats, facade, lights and crowd, and any part
 *                 painted any color (StadiumLook.colors)
 *   Field         the surface, the mowing, the end zones and their lettering
 *   Surroundings  where the stadium stands, the neighborhood around it, the
 *                 tailgate in the lots, the plaza's paving and the extras
 */

import { defaultStadiumName } from '@/lib/franchise/stadiumName';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, EyeIcon, Layers, Lock, Maximize2, Moon, Rocket, RotateCcw, Shuffle, Sun } from '@/components/icons';
import { styleBuild } from '@/lib/franchise/stadiumStyles';
import type { ShopItem } from './FranchiseHQ';
import { COLOR_SLOTS, FEATURES, LIMITS, LOOK_OPTIONS, type ColorSlot, type Feature, type StadiumLook } from '@/lib/franchise/model';
import { accentOf, autoColors, mixHex } from '@/lib/franchise/stadiumColors';
import { STYLE_ORDER, STYLES, type StadiumStyle } from '@/lib/franchise/stadiumStyles';
import { blueprint, outerOf, OVAL, type Blueprint } from '@/lib/franchise/stadiumBlueprint';
import { TRACK, type Facilities, type TrackId } from '@/lib/tycoon/catalog';
import { cash } from '@/lib/tycoon/economy';

const EASE = [0.22, 1, 0.36, 1] as const;

export const LOOK_LABELS = {
  facade: { concrete: 'Concrete', brick: 'Brick', glass: 'Glass', steel: 'Steel', stone: 'Limestone' },
  seats: { team: 'Team colors', split: 'Two-tone', classic: 'Classic', mono: 'Blackout', ombre: 'Fade', checker: 'Checkered' },
  turf: { stripes: 'Stripes', checker: 'Checkerboard', plain: 'Plain' },
  field: { green: 'Green', blue: 'Blue', black: 'Black', team: 'Team color' },
  endZone: { color: 'Painted', argyle: 'Diagonals', plain: 'Plain' },
  roof: { auto: 'Automatic', open: 'Always open', closed: 'Always closed' },
  lights: { warm: 'Warm', white: 'Daylight', team: 'Team color' },
  crowd: { mixed: 'Mixed', colorout: 'Color out', whiteout: 'Whiteout', blackout: 'Blackout' },
  setting: { city: 'City', park: 'Park', waterfront: 'Waterfront', mountains: 'Mountains', desert: 'Desert' },
  district: { downtown: 'Downtown', college: 'College town', suburbs: 'Suburbs', countryside: 'Countryside' },
  tailgate: { off: 'No tailgating', chill: 'Laid back', rowdy: 'Rowdy' },
  plaza: { concrete: 'Concrete', brick: 'Brick', garden: 'Garden' },
  features: { statue: 'Legend statue', fountain: 'Fountain', foodtrucks: 'Food trucks', banners: 'Street banners', ferriswheel: 'Ferris wheel' },
} as const;

const DISTRICT_NOTES: Record<StadiumLook['district'], string> = {
  downtown: 'Office towers and city blocks, lit after dark.',
  college: 'Brick halls, quads and a clock tower.',
  suburbs: 'Streets of houses with yards and driveways.',
  countryside: 'Farms, barns, crop fields and a water tower.',
};
const TAILGATE_NOTES: Record<StadiumLook['tailgate'], string> = {
  off: 'Just cars in the lots.',
  chill: 'Tents and grills behind some of the cars.',
  rowdy: 'Tents everywhere, RVs and a party tent on the overflow field.',
};

const SETTING_NOTES: Record<StadiumLook['setting'], string> = {
  city: 'A skyline that lights up at dusk.',
  park: 'Lawns, hills and neighborhoods.',
  waterfront: 'On the bay, boats and all.',
  mountains: 'Pines and snowy peaks.',
  desert: 'Dunes, cacti and pyramids.',
};
const FACADE_ART: Record<StadiumLook['facade'], string> = {
  concrete: 'linear-gradient(135deg,#ddd8ce,#a9a294)',
  brick: 'repeating-linear-gradient(0deg,#9c4a32 0 6px,#e6dccb 6px 7px)',
  glass: 'linear-gradient(135deg,#bfe3f7,#5c9cc7)',
  steel: 'linear-gradient(135deg,#c3cbd2,#6d7884)',
  stone: 'linear-gradient(135deg,#ece2cc,#c2b293)',
};
const ACCENTS = ['#ffffff', '#15181c', '#d4a017', '#b8bec6', '#1f2a44', '#c8102e', '#f26a21', '#1f7a3a', '#5b2a86', '#00a3ad'];
const PREVIEW_HOURS: { label: string; hour: number | undefined; icon?: typeof Sun }[] = [
  { label: 'Now', hour: undefined }, { label: 'Day', hour: 13, icon: Sun }, { label: 'Sunset', hour: 17.4 }, { label: 'Night', hour: 22, icon: Moon },
];
const TABS = [
  { id: 'build', label: 'Build' },
  { id: 'stadium', label: 'Stadium' },
  { id: 'colors', label: 'Colors' },
  { id: 'field', label: 'Field' },
  { id: 'world', label: 'Surroundings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export function lookSummary(look: StadiumLook): string {
  return `${STYLES[look.style].name}, ${LOOK_LABELS.facade[look.facade].toLowerCase()}, ${LOOK_LABELS.setting[look.setting].toLowerCase()}`;
}

export function StadiumStudio({ franchiseId, auth, look, name, hour, color, teamName, facilities, fullBuild, compact = false, onLook, onName, onHour, onFullBuild, onFullscreen, saved, onSaved, build }: {
  franchiseId: string; auth: Record<string, string> | null; look: StadiumLook; name: string; hour: number | undefined;
  color: string; teamName: string; facilities: Facilities; fullBuild: boolean;
  /** In a narrow panel (fullscreen): one column, and the save bar stays in view. */
  compact?: boolean;
  /** Shows a button that opens the stadium and the studio fullscreen. */
  onFullscreen?: () => void;
  onLook: (l: StadiumLook) => void; onName: (n: string) => void; onHour: (h: number | undefined) => void; onFullBuild: (v: boolean) => void;
  saved: { look: StadiumLook; name: string }; onSaved?: () => void;
  /** The franchise's manager: the upgrades, previewed on the stadium and built from here. */
  build?: { shop: ShopItem[]; vc: number; preview: TrackId | null; building: TrackId | null; error: string; onPreview: (t: TrackId | null) => void; onBuild: (i: ShopItem) => void };
}) {
  const [tab, setTab] = useState<Tab>(build ? 'build' : 'stadium');
  const tabs = TABS.filter(t => t.id !== 'build' || build);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = name.trim() !== saved.name || JSON.stringify(look) !== JSON.stringify(saved.look);
  const set = <K extends keyof StadiumLook>(k: K, v: StadiumLook[K]) => { setMsg(null); onLook({ ...look, [k]: v }); };
  // The latest look, for the paint shop's color picker, which updates many times a second while dragged.
  const lookRef = useRef(look);
  lookRef.current = look;

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/franchises/${encodeURIComponent(franchiseId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', ...(auth ?? {}) },
      body: JSON.stringify({ stadiumName: name, look }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) { setMsg({ ok: true, text: 'Saved. Everyone sees it now.' }); onSaved?.(); }
    else setMsg({ ok: false, text: r?.status === 401 ? 'Your editing pass has expired. Open the franchise again from your LeaguePulse account.' : d?.error ?? 'That did not save.' });
    setBusy(false);
  };
  const surprise = () => {
    setMsg(null);
    onLook({
      ...look,
      style: pick(LOOK_OPTIONS.style), facade: pick(LOOK_OPTIONS.facade), seats: pick(LOOK_OPTIONS.seats), turf: pick(LOOK_OPTIONS.turf),
      field: Math.random() < 0.7 ? 'green' : pick(LOOK_OPTIONS.field), endZone: pick(LOOK_OPTIONS.endZone),
      lights: pick(LOOK_OPTIONS.lights), crowd: pick(LOOK_OPTIONS.crowd), setting: pick(LOOK_OPTIONS.setting),
      district: pick(LOOK_OPTIONS.district), tailgate: pick(LOOK_OPTIONS.tailgate), plaza: pick(LOOK_OPTIONS.plaza),
      features: FEATURES.filter(() => Math.random() < 0.45),
      accent: Math.random() < 0.3 ? null : pick(ACCENTS),
    });
  };
  const accent = look.accent ?? '#ffffff';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className={cn('min-w-0 basis-full sm:basis-auto sm:flex-1', !compact && 'sm:max-w-sm')}>
          <label className="block text-[12.5px] font-medium text-muted-foreground" htmlFor="stadium-name">Stadium name</label>
          <input id="stadium-name" value={name} onChange={e => { setMsg(null); onName(e.target.value); }} maxLength={LIMITS.stadiumName} placeholder={defaultStadiumName(franchiseId, teamName)}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] outline-none focus:border-foreground/40" />
        </div>
        <div className="flex gap-2">
          <button onClick={surprise}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
            <Shuffle className="h-3.5 w-3.5" /> Surprise me
          </button>
          {onFullscreen && (
            <button onClick={onFullscreen}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-[12.5px] font-semibold text-background transition hover:bg-foreground/85">
              <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="mt-5 flex gap-1 overflow-x-auto rounded-full border border-border bg-muted/40 p-1 [scrollbar-width:none]">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); if (t.id !== 'build') build?.onPreview(null); }}
            className={cn('relative shrink-0 flex-1 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', tab === t.id ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
            {tab === t.id && <motion.span layoutId="studio-tab" className="absolute inset-0 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: EASE }} className="mt-5">
          {tab === 'build' && build && <BuildTab build={build} style={look.style} compact={compact} />}

          {tab === 'stadium' && (
            <div className="space-y-5">
              <div className={cn('grid grid-cols-2 gap-2.5', !compact && 'lg:grid-cols-3')}>
                {STYLE_ORDER.map((s, i) => (
                  <StyleCard key={s} style={s} selected={look.style === s} index={i} facilities={fullBuild ? FULL : facilities} color={color} accent={accent}
                    onPick={() => set('style', s)} />
                ))}
              </div>
              <BuildsIn style={look.style} facilities={facilities} compact={compact} />
              {STYLES[look.style].movingRoof && (
                <Field label="Roof" hint={facilities.stadium >= 3 || fullBuild ? 'Automatic closes it at night and in the cold months.' : 'Your roof opens and closes once you reach the Cathedral. Preview it fully built to try it.'}>
                  <Chips options={LOOK_OPTIONS.roof} labels={LOOK_LABELS.roof} value={look.roof} onPick={v => set('roof', v)} />
                </Field>
              )}
            </div>
          )}

          {tab === 'colors' && (
            <div className={cn('grid gap-5', !compact && 'md:grid-cols-2')}>
              <Field label="Accent color" hint="Your second color: trim, two-tone seats, flags and end zone lettering.">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => set('accent', null)} aria-pressed={look.accent === null}
                    className={cn('h-8 rounded-full border px-3 text-[12px] font-semibold transition', look.accent === null ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                    Auto
                  </button>
                  {ACCENTS.map(c => <Swatch key={c} color={c} selected={look.accent === c} onPick={() => set('accent', c)} />)}
                  <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-border" title="Any color"
                    style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}>
                    <input type="color" value={accent} onChange={e => set('accent', e.target.value.toLowerCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Pick any accent color" />
                    {look.accent && !ACCENTS.includes(look.accent) && <span className="absolute inset-1.5 rounded-full border-2 border-white" style={{ background: look.accent }} />}
                  </label>
                </div>
              </Field>
              <Field label="Seats">
                <Tiles options={LOOK_OPTIONS.seats} labels={LOOK_LABELS.seats} value={look.seats} onPick={v => set('seats', v)}
                  art={v => { const a = autoColors({ ...look, seats: v }, color), s1 = look.colors.seats ?? a.seats, s2 = look.colors.seats2 ?? a.seats2;
                    return v === 'split' ? `repeating-linear-gradient(90deg,${s1} 0 10px,${s2} 10px 20px)`
                      : v === 'checker' ? `repeating-conic-gradient(${s1} 0 25%,${s2} 0 50%) 0 0/14px 14px`
                      : v === 'ombre' ? `linear-gradient(0deg,${s1},${s2})`
                      : `linear-gradient(0deg,${s1} 50%,${s2} 50%)`; }} />
              </Field>
              <Field label="Facade">
                <Tiles options={LOOK_OPTIONS.facade} labels={LOOK_LABELS.facade} value={look.facade} onPick={v => set('facade', v)} art={v => FACADE_ART[v]} />
              </Field>
              <Field label="Stadium lights" hint="Seen at night, and inside a closed roof.">
                <Tiles options={LOOK_OPTIONS.lights} labels={LOOK_LABELS.lights} value={look.lights} onPick={v => set('lights', v)}
                  art={v => `radial-gradient(circle at 50% 60%,${v === 'warm' ? '#ffe2a8' : v === 'white' ? '#f2f7ff' : color} 0%,transparent 70%),#0b1430`} />
              </Field>
              <Field label="Crowd" hint="What the fans wear on game day.">
                <Tiles options={LOOK_OPTIONS.crowd} labels={LOOK_LABELS.crowd} value={look.crowd} onPick={v => set('crowd', v)}
                  art={v => crowdArt(v, color, accent)} />
              </Field>
              <div className={cn(!compact && 'md:col-span-2')}>
                <PaintShop look={look} team={color} onColors={colors => { setMsg(null); onLook({ ...lookRef.current, colors }); }} />
              </div>
            </div>
          )}

          {tab === 'field' && (
            <div className={cn('grid gap-5', !compact && 'md:grid-cols-2')}>
              <Field label="Surface">
                <Tiles options={LOOK_OPTIONS.field} labels={LOOK_LABELS.field} value={look.field} onPick={v => set('field', v)}
                  art={v => ({ green: '#3a8a3e', blue: '#2a62b5', black: '#23272b', team: color })[v]} />
              </Field>
              <Field label="Mowing">
                <Tiles options={LOOK_OPTIONS.turf} labels={LOOK_LABELS.turf} value={look.turf} onPick={v => set('turf', v)}
                  art={v => v === 'stripes' ? 'repeating-linear-gradient(90deg,#3a8a3e 0 8px,#317a36 8px 16px)'
                    : v === 'checker' ? 'repeating-conic-gradient(#3a8a3e 0 25%,#317a36 0 50%) 0 0/14px 14px' : '#3a8a3e'} />
              </Field>
              <Field label="End zones">
                <Tiles options={LOOK_OPTIONS.endZone} labels={LOOK_LABELS.endZone} value={look.endZone} onPick={v => set('endZone', v)}
                  art={v => v === 'color' ? color : v === 'argyle' ? `repeating-linear-gradient(45deg,${color} 0 4px,#3a8a3e 4px 11px)` : '#3a8a3e'} />
              </Field>
              <Field label="End zone lettering" hint={`Painted in both end zones and on the video boards. ${teamName} when left empty.`}>
                <input value={look.endZoneText ?? ''} maxLength={LIMITS.endZoneText} placeholder={teamName}
                  onChange={e => set('endZoneText', e.target.value || null)}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px] font-bold uppercase tracking-wide outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal focus:border-foreground/40" />
              </Field>
            </div>
          )}

          {tab === 'world' && (
            <div className="space-y-6">
              <Field label="Setting" hint="The horizon past it all.">
                <div className={cn('grid grid-cols-2 gap-2.5', !compact && 'sm:grid-cols-3 lg:grid-cols-5')}>
                  {LOOK_OPTIONS.setting.map((s, i) => (
                    <SceneCard key={s} index={i} selected={look.setting === s} onPick={() => set('setting', s)}
                      art={<SettingArt setting={s} />} label={LOOK_LABELS.setting[s]} note={SETTING_NOTES[s]} />
                  ))}
                </div>
              </Field>
              <Field label="Neighborhood" hint="What surrounds the parking lots.">
                <div className={cn('grid grid-cols-2 gap-2.5', !compact && 'lg:grid-cols-4')}>
                  {LOOK_OPTIONS.district.map((d, i) => (
                    <SceneCard key={d} index={i} selected={look.district === d} onPick={() => set('district', d)}
                      art={<DistrictArt district={d} color={color} />} label={LOOK_LABELS.district[d]} note={DISTRICT_NOTES[d]} />
                  ))}
                </div>
              </Field>
              <div className={cn('grid gap-5', !compact && 'md:grid-cols-2')}>
                <Field label="Tailgating" hint={TAILGATE_NOTES[look.tailgate]}>
                  <Chips options={LOOK_OPTIONS.tailgate} labels={LOOK_LABELS.tailgate} value={look.tailgate} onPick={v => set('tailgate', v)} />
                </Field>
                <Field label="Plaza paving">
                  <Tiles options={LOOK_OPTIONS.plaza} labels={LOOK_LABELS.plaza} value={look.plaza} onPick={v => set('plaza', v)}
                    art={v => v === 'brick' ? 'repeating-linear-gradient(0deg,#a5583f 0 7px,#7d4b3a 7px 8px)'
                      : v === 'garden' ? 'radial-gradient(circle at 25% 40%,#4f8f3a 0 18%,transparent 19%),radial-gradient(circle at 75% 60%,#4f8f3a 0 16%,transparent 17%),#d6ccb5'
                        : 'repeating-conic-gradient(#d5cfc2 0 25%,#c4bdaf 0 50%) 0 0/20px 20px'} />
                </Field>
              </div>
              <Field label="Extras" hint="Turn on as many as you like.">
                <div className="flex flex-wrap gap-1.5">
                  {FEATURES.map(f => {
                    const on = look.features.includes(f);
                    return (
                      <button key={f} onClick={() => set('features', on ? look.features.filter(x => x !== f) : FEATURES.filter(x => x === f || look.features.includes(x)))} aria-pressed={on}
                        className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition',
                          on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                        <FeatureMark feature={f} />{LOOK_LABELS.features[f]}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Preview controls and saving */}
      <div className={cn('mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4',
        compact && 'sticky bottom-0 -mx-4 justify-end bg-background/95 px-4 pb-4 backdrop-blur sm:-mx-5 sm:px-5')}>
        {!compact && <PreviewControls hour={hour} fullBuild={fullBuild} onHour={onHour} onFullBuild={onFullBuild} />}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {msg ? (
              <motion.span key="msg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn('text-[12.5px]', msg.ok ? 'text-primary' : 'text-destructive')}>{msg.text}</motion.span>
            ) : changed ? (
              <motion.span key="dirty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
              </motion.span>
            ) : null}
          </AnimatePresence>
          {changed && (
            <button onClick={() => { setMsg(null); onLook(saved.look); onName(saved.name); }} title="Discard changes"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button onClick={save} disabled={!changed || busy}
            className="rounded-full bg-foreground px-5 py-2.5 text-[13.5px] font-semibold text-background hover:bg-foreground/85 disabled:opacity-50">
            {busy ? 'Saving' : 'Save stadium'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Time of day and the fully built preview, under the studio or over the stadium in fullscreen. */
export function PreviewControls({ hour, fullBuild, onHour, onFullBuild, overlay = false }: {
  hour: number | undefined; fullBuild: boolean; onHour: (h: number | undefined) => void; onFullBuild: (v: boolean) => void; overlay?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cn('inline-flex rounded-full p-0.5', overlay ? 'bg-black/45 text-white backdrop-blur-md' : 'border border-border')} role="group" aria-label="Preview time of day">
        {PREVIEW_HOURS.map(({ label, hour: h, icon: Icon }) => (
          <button key={label} onClick={() => onHour(h)} aria-pressed={hour === h}
            className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition',
              hour === h ? (overlay ? 'bg-white text-black' : 'bg-foreground text-background') : overlay ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground')}>
            {Icon && <Icon className="h-3 w-3" />}{label}
          </button>
        ))}
      </div>
      <button onClick={() => onFullBuild(!fullBuild)} aria-pressed={fullBuild}
        className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
          overlay ? (fullBuild ? 'bg-white text-black' : 'bg-black/45 text-white/90 backdrop-blur-md hover:text-white')
            : fullBuild ? 'border border-primary bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:text-foreground')}>
        <Layers className="h-3.5 w-3.5" /> {overlay ? 'Fully built' : 'Preview fully built'}
      </button>
    </div>
  );
}

const FULL: Facilities = { stadium: 4, seating: 3, concessions: 4, restrooms: 3, parking: 4, videoboard: 3, suites: 3, store: 3, atmosphere: 3 };
export { FULL as FULLY_BUILT };

function crowdArt(v: StadiumLook['crowd'], team: string, accent: string) {
  const dots = { mixed: [team, '#f2f2f2', accent, '#2b2b2b'], colorout: [team, team, accent, team], whiteout: ['#fafafa', '#e9e9e6', '#ffffff', team], blackout: ['#1b1c1e', '#2b2c30', '#1b1c1e', team] }[v];
  return dots.map((c, i) => `radial-gradient(circle at ${18 + (i % 2) * 34 + (i > 1 ? 17 : 0)}% ${i > 1 ? 70 : 32}%,${c} 0 13%,transparent 14%)`).join(',') + ',#8d939b';
}

/** A little scene for each setting. */
function SettingArt({ setting }: { setting: StadiumLook['setting'] }) {
  const sky = setting === 'desert' ? ['#f6c98f', '#fde9c9'] : ['#8ec9ec', '#d8eef9'];
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMax slice" className="h-full w-full transition-transform duration-500 group-hover:scale-[1.05]" aria-hidden>
      <defs><linearGradient id={`sky-${setting}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky[0]} /><stop offset="1" stopColor={sky[1]} /></linearGradient></defs>
      <rect width="160" height="80" fill={`url(#sky-${setting})`} />
      {setting === 'city' && <>
        {[[8, 30], [22, 18], [34, 36], [50, 24], [64, 40], [80, 14], [96, 30], [110, 22], [124, 38], [140, 26]].map(([x, h], i) => <rect key={i} x={x} y={56 - h} width={12} height={h} fill={i % 2 ? '#6b7686' : '#7d8898'} />)}
        {[[24, 44], [52, 38], [82, 48], [112, 40]].map(([x, y], i) => <rect key={i} x={x} y={y} width={3} height={3} fill="#ffd98a" />)}
        <rect y="56" width="160" height="24" fill="#5f8a4c" />
      </>}
      {setting === 'park' && <>
        <ellipse cx="30" cy="62" rx="60" ry="20" fill="#86b665" /><ellipse cx="130" cy="64" rx="70" ry="22" fill="#7aa65a" />
        {[[48, 52], [70, 55], [104, 50]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width={10} height={7} fill="#efe7d6" /><path d={`M${x - 1} ${y} L${x + 5} ${y - 5} L${x + 11} ${y} Z`} fill="#8a4a38" /></g>)}
        {[20, 30, 120, 138].map((x, i) => <circle key={i} cx={x} cy={56 - (i % 2) * 2} r={5} fill="#3f7d32" />)}
        <rect y="64" width="160" height="16" fill="#6a9a50" />
      </>}
      {setting === 'waterfront' && <>
        {[[30, 14], [42, 22], [54, 12], [66, 18], [78, 10]].map(([x, h], i) => <rect key={i} x={x} y={44 - h} width={10} height={h} fill="#8b97a8" />)}
        <rect y="44" width="160" height="22" fill="#3f7fa6" />
        <path d="M100 56 l14 0 l-2 4 l-10 0 Z" fill="#fff" /><path d="M107 55 l0 -10 l6 10 Z" fill="#fafafa" />
        {[12, 40, 130].map((x, i) => <path key={i} d={`M${x} ${50 + i * 3} q4 -2 8 0`} stroke="#9fd0ef" fill="none" strokeWidth="1" />)}
        <rect y="64" width="160" height="3" fill="#e3d3a6" /><rect y="67" width="160" height="13" fill="#5f8a4c" />
      </>}
      {setting === 'mountains' && <>
        <path d="M-10 64 L30 18 L70 64 Z" fill="#6d7a72" /><path d="M30 18 L22 28 L30 26 L38 28 Z" fill="#f2f6f8" />
        <path d="M40 64 L92 8 L144 64 Z" fill="#5a6862" /><path d="M92 8 L81 20 L92 17 L103 20 Z" fill="#f2f6f8" />
        <path d="M110 64 L146 26 L182 64 Z" fill="#738078" /><path d="M146 26 L139 34 L146 32 L153 34 Z" fill="#f2f6f8" />
        {[12, 22, 128, 140, 150].map((x, i) => <path key={i} d={`M${x} 68 l4 -11 l4 11 Z`} fill="#2f5d34" />)}
        <rect y="64" width="160" height="16" fill="#587f48" />
      </>}
      {setting === 'desert' && <>
        <circle cx="128" cy="20" r="9" fill="#fff1c9" />
        <path d="M20 56 L44 26 L68 56 Z" fill="#dcbd84" /><path d="M44 26 L68 56 L52 56 Z" fill="#c9a66c" />
        <path d="M62 56 L78 37 L94 56 Z" fill="#e2c592" /><path d="M78 37 L94 56 L84 56 Z" fill="#c9a66c" />
        <path d="M100 56 L109 46 L118 56 Z" fill="#e2c592" />
        <rect y="56" width="160" height="24" fill="#cdb383" />
        <g fill="#5f8a4a"><rect x="70" y="50" width="4" height="18" rx="2" /><rect x="64" y="54" width="3" height="8" rx="1.5" /><rect x="64" y="60" width="8" height="3" rx="1.5" /><rect x="77" y="52" width="3" height="8" rx="1.5" /><rect x="72" y="58" width="8" height="3" rx="1.5" /></g>
      </>}
    </svg>
  );
}

const PAINT_GROUPS: { title: string; slots: ColorSlot[] }[] = [
  { title: 'Seats and crowd', slots: ['seats', 'seats2', 'crowd'] },
  { title: 'Building', slots: ['walls', 'trim', 'roof', 'steel', 'boards'] },
  { title: 'Field', slots: ['field', 'endzones', 'lettering', 'podium', 'posts'] },
  { title: 'Lights', slots: ['lights'] },
];
const PAINT_LABELS: Record<ColorSlot, { label: string; note: string }> = {
  seats: { label: 'Seats', note: 'The main seat color, in the pattern you picked.' },
  seats2: { label: 'Second seat color', note: 'The other color in two-tone, fade and checkered seats.' },
  crowd: { label: 'Fans\' jerseys', note: 'The color the crowd wears.' },
  walls: { label: 'Outer walls', note: 'The stadium\'s outside, whatever it\'s built from.' },
  trim: { label: 'Trim', note: 'Bands, edges, the press box and the roof\'s rim.' },
  roof: { label: 'Roof', note: 'Canopies, gables, membranes and domes.' },
  steel: { label: 'Steel', note: 'Masts, ribs, trusses and posts.' },
  boards: { label: 'Scoreboard frames', note: 'Around every video board.' },
  field: { label: 'Field', note: 'The turf, mowing and all.' },
  endzones: { label: 'End zones', note: 'Painted end zones and their diagonals.' },
  lettering: { label: 'End zone lettering', note: 'The name painted in the end zones.' },
  podium: { label: 'Field wall', note: 'The wall between the field and the stands.' },
  posts: { label: 'Goalposts', note: 'Classic yellow, or anything else.' },
  lights: { label: 'Light color', note: 'The floodlights and the glow at night.' },
};
const QUICK = ['#ffffff', '#f3ead7', '#c9ced3', '#6b7280', '#15181c', '#c8102e', '#f26a21', '#d4a017', '#1f7a3a', '#00a3ad', '#1f4fa8', '#1f2a44', '#5b2a86', '#e64d8b'];

/** Whole-stadium color themes to start from, made from the team's own colors. */
function themes(team: string, accent: string): { name: string; colors: StadiumLook['colors'] }[] {
  return [
    { name: 'All in', colors: { seats: team, seats2: accent, walls: mixHex(team, '#000000', 0.35), trim: accent, roof: accent, steel: mixHex(team, '#ffffff', 0.5), podium: team, endzones: team, crowd: team } },
    { name: 'Blackout', colors: { seats: '#1b1c1f', seats2: '#2a2c31', walls: '#22252a', trim: team, roof: '#16181b', steel: '#3a3f45', podium: '#111214', boards: '#111214', crowd: '#1b1c1e', lights: mixHex(team, '#ffffff', 0.4) } },
    { name: 'Throwback', colors: { seats: '#2f6b3b', seats2: '#3a7d47', walls: '#a5583f', trim: '#f3ead7', roof: '#f3ead7', steel: '#3d5a45', podium: '#2f6b3b', posts: '#f3ead7', boards: '#1f3b2d', lights: '#fff1cf' } },
    { name: 'Ice', colors: { seats: '#dfe9f2', seats2: '#9fc3e0', walls: '#eef3f7', trim: '#9fc3e0', roof: '#ffffff', steel: '#c9d6e2', podium: '#2c4a66', boards: '#eef3f7', lights: '#eef5ff', crowd: '#f4f7fb' } },
    { name: 'Gilded', colors: { seats: '#1b1c1f', seats2: '#d4a017', walls: '#15181c', trim: '#d4a017', roof: '#d4a017', steel: '#b8901a', podium: '#15181c', posts: '#d4a017', boards: '#d4a017', lettering: '#d4a017', lights: '#ffe2a8' } },
  ];
}

/**
 * Paint any part of the stadium any color. Each part shows the color it is now
 * (its own, "Auto", until painted); open one for the full color wheel, a hex
 * code, quick swatches and the team's colors. Dragging the wheel repaints the
 * stadium a dozen times a second rather than on every pixel, so it stays smooth.
 */
function PaintShop({ look, team, onColors }: { look: StadiumLook; team: string; onColors: (c: StadiumLook['colors']) => void }) {
  const auto = useMemo(() => autoColors(look, team), [look, team]);
  const accent = accentOf(look, team);
  const [open, setOpen] = useState<ColorSlot | null>(null);
  const painted = COLOR_SLOTS.filter(k => look.colors[k]).length;
  // Coalesce a dragged picker: apply at once, then at most every 80ms, always ending on the last color.
  const latest = useRef(look.colors);
  latest.current = look.colors;
  const queued = useRef<{ slot: ColorSlot; value: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const apply = (slot: ColorSlot, value: string | null) => {
    const next = { ...latest.current };
    if (value) next[slot] = value; else delete next[slot];
    latest.current = next;
    onColors(next);
  };
  const paint = (slot: ColorSlot, value: string | null) => {
    if (timer.current) { queued.current = { slot, value }; return; }
    apply(slot, value);
    timer.current = setTimeout(function flush() {
      const q = queued.current;
      queued.current = null;
      if (q) { apply(q.slot, q.value); timer.current = setTimeout(flush, 80); } else timer.current = null;
    }, 80);
  };

  return (
    <div className="rounded-2xl border border-border p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-semibold">Paint it yourself</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">Any part, any color. Left on Auto, a part follows your team colors and the choices above.</p>
        </div>
        {painted > 0 && (
          <button onClick={() => { setOpen(null); onColors({}); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> All back to auto
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="self-center pr-1 text-[11.5px] font-semibold text-muted-foreground">Start from</span>
        {themes(team, accent).map(t => (
          <button key={t.name} onClick={() => { setOpen(null); onColors(t.colors); }}
            className="group inline-flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-[12px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
            <span className="flex h-6 w-6 overflow-hidden rounded-full ring-1 ring-black/10" aria-hidden>
              {[t.colors.seats, t.colors.walls, t.colors.trim].map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)}
            </span>
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {PAINT_GROUPS.map(gr => (
          <div key={gr.title}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{gr.title}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {gr.slots.map(slot => {
                const mine = look.colors[slot], shown = mine ?? auto[slot], isOpen = open === slot;
                return (
                  <div key={slot} className={cn('rounded-xl border transition', isOpen ? 'border-foreground/40 sm:col-span-2' : 'border-border')}>
                    <button onClick={() => setOpen(isOpen ? null : slot)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-muted/50">
                      <span className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/10 dark:ring-white/15" style={{ background: shown }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{PAINT_LABELS[slot].label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{mine ? shown.toUpperCase() : 'Auto'}</span>
                      </span>
                      {mine && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">Custom</span>}
                    </button>
                    {isOpen && <PaintEditor slot={slot} value={shown} custom={!!mine} team={team} accent={accent} onPaint={v => paint(slot, v)} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaintEditor({ slot, value, custom, team, accent, onPaint }: {
  slot: ColorSlot; value: string; custom: boolean; team: string; accent: string; onPaint: (v: string | null) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => { setHex(value); }, [value]);
  const commit = (v: string) => {
    const h = v.trim().replace(/^#?/, '#').toLowerCase();
    const full = /^#[0-9a-f]{3}$/.test(h) ? '#' + [...h.slice(1)].map(ch => ch + ch).join('') : h;
    if (/^#[0-9a-f]{6}$/.test(full)) onPaint(full);
  };
  return (
    <div className="space-y-3 border-t border-border px-2.5 pb-3 pt-3">
      <p className="text-[11.5px] text-muted-foreground">{PAINT_LABELS[slot].note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative h-10 w-16 cursor-pointer overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/15" style={{ background: value }} title="Any color">
          <input type="color" value={value} onChange={e => onPaint(e.target.value.toLowerCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Pick any color for ${PAINT_LABELS[slot].label}`} />
          <span className="pointer-events-none absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-1 ring-white/70" style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }} />
        </label>
        <input value={hex} onChange={e => { setHex(e.target.value); commit(e.target.value); }} onBlur={() => setHex(value)} maxLength={7} spellCheck={false}
          aria-label="Hex color" className="h-10 w-28 rounded-lg border border-border bg-background px-2.5 font-mono text-[13px] uppercase outline-none focus:border-foreground/40" />
        <button onClick={() => onPaint(team)} className="h-10 rounded-lg border border-border px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
          <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-black/10" style={{ background: team }} />Team
        </button>
        <button onClick={() => onPaint(accent)} className="h-10 rounded-lg border border-border px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
          <span className="mr-1.5 inline-block h-3 w-3 rounded-full align-[-1px] ring-1 ring-black/10" style={{ background: accent }} />Accent
        </button>
        {custom && (
          <button onClick={() => onPaint(null)} className="h-10 rounded-lg px-2.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground">Back to auto</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map(c => <Swatch key={c} color={c} selected={value === c} onPick={() => onPaint(c)} />)}
      </div>
    </div>
  );
}

function SceneCard({ index, selected, onPick, art, label, note }: { index: number; selected: boolean; onPick: () => void; art: React.ReactNode; label: string; note: string }) {
  return (
    <motion.button onClick={onPick} aria-pressed={selected}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, ease: EASE }}
      className={cn('group flex flex-col overflow-hidden rounded-2xl border text-left transition', selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-border hover:border-foreground/30')}>
      <div className="relative h-20 w-full shrink-0 overflow-hidden">
        {art}
        {selected && <Picked />}
      </div>
      <div className="p-2.5">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="text-[11.5px] leading-snug text-muted-foreground">{note}</p>
      </div>
    </motion.button>
  );
}

/** Each neighborhood from above. */
function DistrictArt({ district, color }: { district: StadiumLook['district']; color: string }) {
  return (
    <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid slice" className="h-full w-full transition-transform duration-500 group-hover:scale-[1.05]" aria-hidden>
      <rect width="160" height="80" fill={district === 'countryside' ? '#7aa65a' : '#6a9a50'} />
      {district === 'downtown' && <>
        {[0, 1, 2, 3].map(r => <rect key={`h${r}`} y={r * 22 + 15} width="160" height="5" fill="#3a3e44" />)}
        {[0, 1, 2, 3, 4, 5].map(c => <rect key={`v${c}`} x={c * 30 + 22} width="5" height="80" fill="#3a3e44" />)}
        {Array.from({ length: 24 }, (_, i) => {
          const c = i % 6, r = Math.floor(i / 6), sh = ['#8a96a3', '#a3adb7', '#6f7c89', '#b9c2ca'][(i * 7) % 4];
          return <g key={i}><rect x={c * 30 - 4} y={r * 22 - 3} width="22" height="14" fill={sh} /><rect x={c * 30 - 4} y={r * 22 + 9} width="22" height="3" fill="#00000022" /></g>;
        })}
      </>}
      {district === 'college' && <>
        <rect x="20" y="16" width="120" height="48" fill="#86b665" />
        <path d="M20 16 L140 64 M140 16 L20 64" stroke="#d9cfb8" strokeWidth="2.5" />
        {[[6, 6, 34, 10], [60, 4, 40, 11], [120, 6, 34, 10], [6, 66, 34, 10], [60, 66, 40, 11], [120, 66, 34, 10], [4, 26, 12, 28], [144, 26, 12, 28]].map(([x, y, w, h], i) =>
          <rect key={i} x={x} y={y} width={w} height={h} fill={i % 2 ? '#9c4a32' : '#a85a3c'} />)}
        <rect x="74" y="34" width="12" height="12" fill="#9c4a32" /><path d="M74 34 L80 28 L86 34 Z" fill="#3d5a45" />
        {[[34, 26], [126, 54], [40, 56], [118, 24]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#3f7d32" />)}
      </>}
      {district === 'suburbs' && <>
        {[0, 1].map(r => <rect key={r} y={r * 40 + 18} width="160" height="5" fill="#3a3e44" />)}
        {Array.from({ length: 16 }, (_, i) => {
          const c = i % 8, r = Math.floor(i / 8), x = c * 20 + 4, y = r * 40 + (r ? 26 : 2);
          return (
            <g key={i}>
              <rect x={x} y={y} width="12" height="10" fill={['#e8e1d3', '#c9d6df', '#e6d3b8', '#d9c4c4'][i % 4]} />
              <path d={`M${x} ${y + 5} L${x + 12} ${y + 5}`} stroke="#5b4a44" strokeWidth="1.2" />
              <rect x={x + 13} y={y + (r ? -6 : 8)} width="3" height="8" fill="#b9b4aa" />
              <circle cx={x + 2} cy={y + (r ? 14 : -1)} r="2.5" fill="#3f7d32" />
            </g>
          );
        })}
      </>}
      {district === 'countryside' && <>
        {([[0, 0, 70, 36, '#c9a94a'], [74, 0, 86, 36, '#6f8f3a'], [0, 42, 60, 38, '#7a5a3a'], [96, 42, 64, 38, '#8aa04a']] as const).map(([x, y, w, h, c], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={c} />
            {Array.from({ length: 6 }, (_, k) => <rect key={k} x={x} y={y + k * (h / 6)} width={w} height="1.5" fill="#00000018" />)}
          </g>
        ))}
        <rect y="37" width="160" height="4" fill="#a8997c" />
        <rect x="66" y="48" width="18" height="12" fill="#9b2d22" /><path d="M64 48 L75 41 L86 48 Z" fill="#3b3f44" />
        <circle cx="90" cy="52" r="4" fill="#c9ced3" />
        <circle cx="140" cy="20" r="6" fill={color} stroke="#ffffff" strokeWidth="1.5" />
      </>}
    </svg>
  );
}

function FeatureMark({ feature }: { feature: Feature }) {
  const d: Record<Feature, React.ReactNode> = {
    statue: <><rect x="5" y="11" width="6" height="3" /><circle cx="8" cy="3.5" r="1.6" /><path d="M6.8 5.5h2.4l.6 5H6.2z" /><path d="M9 6.2l3-1.8" strokeWidth="1.2" stroke="currentColor" /></>,
    fountain: <><path d="M2 11h12v2H2z" /><path d="M8 10V4M8 4c-2 0-3 2-3.5 4M8 4c2 0 3 2 3.5 4" stroke="currentColor" strokeWidth="1.2" fill="none" /></>,
    foodtrucks: <><path d="M1.5 5h8v6h-8zM9.5 7h3l2 2v2h-5z" /><circle cx="4.5" cy="12" r="1.3" /><circle cx="11.5" cy="12" r="1.3" /></>,
    banners: <><path d="M4 2v12" stroke="currentColor" strokeWidth="1.2" /><path d="M4.6 3h6v6l-3-1.5-3 1.5z" /></>,
    ferriswheel: <><circle cx="8" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" fill="none" /><path d="M8 7l-3 7M8 7l3 7M3 7h10M8 2v10" stroke="currentColor" strokeWidth="0.9" /></>,
  };
  return <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>{d[feature]}</svg>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] font-semibold">{label}</p>
      {hint && <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Picked() {
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background shadow">
      <Check className="h-3 w-3" />
    </motion.span>
  );
}

function Swatch({ color, selected, onPick }: { color: string; selected: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} aria-pressed={selected} aria-label={color} title={color}
      className={cn('relative h-8 w-8 rounded-full border border-black/10 transition hover:scale-110 dark:border-white/15', selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background')}
      style={{ background: color }} />
  );
}

function Chips<V extends string>({ options, labels, value, onPick }: { options: readonly V[]; labels: Record<V, string>; value: V; onPick: (v: V) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(v => (
        <button key={v} onClick={() => onPick(v)} aria-pressed={value === v}
          className={cn('rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition',
            value === v ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
          {labels[v]}
        </button>
      ))}
    </div>
  );
}

/** Choices shown as small swatches of what they look like. */
function Tiles<V extends string>({ options, labels, value, onPick, art }: { options: readonly V[]; labels: Record<V, string>; value: V; onPick: (v: V) => void; art: (v: V) => string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {options.map(v => (
        <button key={v} onClick={() => onPick(v)} aria-pressed={value === v}
          className={cn('group flex flex-col overflow-hidden rounded-xl border text-left transition', value === v ? 'border-foreground ring-2 ring-foreground/15' : 'border-border hover:border-foreground/30')}>
          <div className="relative h-10 w-full shrink-0" style={{ background: art(v) }}>{value === v && <Picked />}</div>
          <p className={cn('truncate px-2 py-1.5 text-[11.5px] font-semibold', value === v ? 'text-foreground' : 'text-muted-foreground')}>{labels[v]}</p>
        </button>
      ))}
    </div>
  );
}

function StyleCard({ style, selected, index, facilities, color, accent, onPick }: {
  style: StadiumStyle; selected: boolean; index: number; facilities: Facilities; color: string; accent: string; onPick: () => void;
}) {
  const info = STYLES[style];
  return (
    <motion.button onClick={onPick} aria-pressed={selected}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, ease: EASE }} whileTap={{ scale: 0.98 }}
      className={cn('group relative flex flex-col overflow-hidden rounded-2xl border text-left transition',
        selected ? 'border-foreground bg-card ring-2 ring-foreground/15' : 'border-border bg-card hover:border-foreground/30')}>
      <div className="relative bg-gradient-to-b from-emerald-900/10 to-emerald-900/0 px-3 pt-3 dark:from-emerald-400/10">
        <PlanView style={style} facilities={facilities} color={color} accent={accent} />
        {selected && <Picked />}
      </div>
      <div className="p-3 pt-1.5">
        <p className="text-[13.5px] font-semibold">{info.name}</p>
        <p className="text-[11.5px] leading-snug text-muted-foreground">{info.tagline}</p>
      </div>
    </motion.button>
  );
}

/** A stadium seen from above, drawn from the same blueprint as the 3D view. */
function PlanView({ style, facilities, color, accent }: { style: StadiumStyle; facilities: Facilities; color: string; accent: string }) {
  const bp = useMemo(() => blueprint(style, facilities), [style, facilities]);
  const { paths, roof, size, cols } = useMemo(() => plan(bp), [bp]);
  const [W, H] = size;
  return (
    <svg viewBox={`${-W} ${-H} ${2 * W} ${2 * H}`} className="mx-auto h-24 w-full transition-transform duration-500 group-hover:scale-[1.04]" aria-hidden>
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.deck % 2 ? `color-mix(in srgb, ${color} 70%, white)` : color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.03} />)}
      <rect x={-3.48} y={-1.55} width={6.96} height={3.1} rx={0.05} fill="#3a8a3e" />
      <rect x={-3.48} y={-1.55} width={0.58} height={3.1} fill={color} />
      <rect x={2.9} y={-1.55} width={0.58} height={3.1} fill={color} />
      <circle cx={0} cy={0} r={0.35} fill={color} stroke={accent} strokeWidth={0.06} />
      {[-2.32, -1.16, 1.16, 2.32].map(x => <line key={x} x1={x} x2={x} y1={-1.55} y2={1.55} stroke="rgba(255,255,255,0.55)" strokeWidth={0.03} />)}
      {/* The roof over it all, see-through so the seats show. */}
      {roof && <path d={roof.d} fillRule="evenodd" fill={roof.kind === 'dome' ? 'rgba(225,238,255,0.6)' : 'rgba(244,246,248,0.72)'} stroke="rgba(110,120,130,0.55)" strokeWidth={0.04} />}
      {roof?.kind === 'dome' && [0.33, 0.66].map(k => <ellipse key={k} cx={0} cy={0} rx={(bp.footprint + 0.05) * OVAL * k} ry={(bp.footprint + 0.05) * k} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={0.04} />)}
      {roof?.kind === 'dome' && [0, 1, 2, 3].map(k => { const a = (k * Math.PI) / 4; return <line key={k} x1={-Math.cos(a) * W} y1={-Math.sin(a) * H} x2={Math.cos(a) * W} y2={Math.sin(a) * H} stroke="rgba(255,255,255,0.7)" strokeWidth={0.03} />; })}
      {cols.map(([x, z], i) => <circle key={i} cx={x} cy={z} r={0.08} fill="#e3d7bd" stroke="rgba(0,0,0,0.3)" strokeWidth={0.02} />)}
    </svg>
  );
}

function plan(bp: Blueprint) {
  const o = bp.outline;
  const pt = (a: number, r: number) => o.around(a, r).map(v => v.toFixed(3)).join(' ');
  const band = (from: number, to: number, inner: (a: number) => number, outer: (a: number) => number) => {
    const N = 48, out: string[] = [], back: string[] = [];
    for (let i = 0; i <= N; i++) {
      const a = from + ((to - from) * i) / N;
      out.push(pt(a, inner(a))); back.unshift(pt(a, outer(a)));
    }
    return `M${out.join(' L')} L${back.join(' L')} Z`;
  };
  const paths: { d: string; deck: number }[] = [];
  for (const s of bp.stands) {
    const n = s.decks((s.from + s.to) / 2).length;
    for (let d = 0; d < n; d++) {
      paths.push({ deck: d, d: band(s.from, s.to, a => s.decks(a)[d].inner, a => s.decks(a)[d].inner + s.decks(a)[d].depth) });
    }
  }
  let roof: { d: string; kind: string } | null = null;
  const main = bp.stands[0];
  if (bp.roof?.kind === 'dome') roof = { kind: 'dome', d: band(0, Math.PI * 2, () => 0, () => bp.footprint + 0.05) };
  else if (bp.roof?.kind === 'membrane') roof = { kind: 'membrane', d: band(0, Math.PI * 2, () => bp.inner + 0.35, a => outerOf(main.decks(a)) + 0.1) };
  else if (bp.roof?.kind === 'canopy') { const span = bp.roof.span; roof = { kind: 'canopy', d: band(0, Math.PI * 2, a => outerOf(main.decks(a)) - span, a => outerOf(main.decks(a)) + 0.06) }; }
  else if (bp.roof?.kind === 'gable') {
    roof = { kind: 'gable', d: bp.stands.filter(s => (bp.roof as { stands: string[] }).stands.includes(s.id))
      .map(s => band(s.from - 0.02, s.to + 0.02, a => s.decks(a).at(-1)!.inner - 0.2, a => outerOf(s.decks(a)) + 0.12)).join(' ') };
  }
  const cols: [number, number][] = [];
  if (bp.colonnade) for (let i = 0; i <= 8; i++) cols.push(o.around(bp.colonnade.from + ((bp.colonnade.to - bp.colonnade.from) * i) / 8, bp.colonnade.r));
  const reach = (bp.berm ? bp.berm.r + 0.3 : bp.footprint) + 0.25;
  return { paths, roof, cols, size: [reach * OVAL, reach] as [number, number] };
}

/**
 * The upgrades, one line each: tap to see the next level on the stadium above, build it from the
 * same row. The economy behind it is unchanged (lib/tycoon/catalog); this is just where it lives now.
 */
function BuildTab({ build, style, compact }: { build: NonNullable<Parameters<typeof StadiumStudio>[0]['build']>; style: StadiumStyle; compact: boolean }) {
  const { shop, vc, preview, building, error, onPreview, onBuild } = build;
  const ready = shop.filter(i => i.next?.affordable).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="font-display text-[28px] font-extrabold leading-none tabular-nums">{cash(vc)} <span className="text-[14px] font-bold text-muted-foreground">in the bank</span></p>
        <p className="text-[12px] text-muted-foreground">{ready ? `${ready} upgrade${ready === 1 ? '' : 's'} ready to build. ` : ''}Tap one to see it on your stadium.</p>
      </div>
      {error && <p className="text-[13px] font-medium text-destructive">{error}</p>}
      <ul className={cn('grid gap-2', !compact && 'md:grid-cols-2')}>
        {shop.map((item, i) => {
          const n = item.next, on = preview === item.track, pct = n ? Math.min(1, vc / n.cost) : 1;
          const how = n ? styleBuild(style, item.track) : null;
          return (
            <motion.li key={item.track} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}
              className={cn('rounded-2xl border p-3 transition', on ? 'border-primary bg-primary/[0.06] shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.8)]' : 'border-border bg-card')}>
              <button onClick={() => n && !item.blocked && onPreview(on ? null : item.track)} disabled={!n || Boolean(item.blocked)} aria-pressed={on}
                className="flex w-full items-start gap-3 text-left disabled:cursor-default">
                <span className="mt-0.5 flex flex-col items-center gap-1">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', on ? 'bg-primary text-primary-foreground' : n?.affordable ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground')}>
                    {!n ? <Check className="h-4 w-4" /> : item.blocked ? <Lock className="h-4 w-4" /> : on ? <EyeIcon className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold">{item.name}</span>
                    <span className="flex gap-0.5" aria-label={`Level ${item.level} of ${item.max}`}>
                      {Array.from({ length: item.max }, (_, k) => (
                        <motion.span key={k} initial={false} animate={{ scale: k < item.level ? 1 : 0.8 }}
                          className={cn('h-2 w-2 rounded-full', k < item.level ? 'bg-primary' : on && k === item.level ? 'bg-primary/45 ring-2 ring-primary/40' : 'bg-muted')} />
                      ))}
                    </span>
                  </span>
                  {n ? (
                    <>
                      <span className="block text-[12.5px] font-medium">{n.name} <span className="text-muted-foreground">· {n.blurb}</span></span>
                      {item.blocked
                        ? <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{item.blocked}</span>
                        : how && <span className="mt-0.5 block text-[11.5px] leading-snug text-primary/90">{how}</span>}
                    </>
                  ) : <span className="block text-[12px] text-muted-foreground">Fully built.</span>}
                </span>
              </button>
              {n && !item.blocked && (
                <div className="mt-2.5 flex items-center gap-2.5 pl-12">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
                  </span>
                  {n.affordable ? (
                    <button onClick={() => onBuild(item)} disabled={building !== null}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition active:scale-[0.97] disabled:opacity-60">
                      <Rocket className="h-3.5 w-3.5" /> {building === item.track ? 'Building…' : `Build, ${cash(n.cost)}`}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">{cash(n.cost)}</span>
                  )}
                </div>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** How each upgrade builds out in the chosen style, with what the franchise has built of it. */
function BuildsIn({ style, facilities, compact }: { style: StadiumStyle; facilities: Facilities; compact: boolean }) {
  const info = STYLES[style];
  const tracks = Object.keys(info.builds) as TrackId[];
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <p className="text-[12.5px] font-semibold">Your upgrades, built the {info.name} way</p>
      <p className="text-[11.5px] text-muted-foreground">Every style costs the same and earns the same. Switching never loses what you have built.</p>
      <ul className={cn('mt-3 grid gap-x-6 gap-y-2.5', !compact && 'sm:grid-cols-2')}>
        {tracks.map(t => (
          <motion.li key={`${style}${t}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2.5">
            <span className="mt-1 flex shrink-0 gap-0.5" aria-label={`Level ${facilities[t]} of ${TRACK[t].levels.length}`}>
              {Array.from({ length: TRACK[t].levels.length }, (_, i) => <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < facilities[t] ? 'bg-primary' : 'bg-muted-foreground/25')} />)}
            </span>
            <span className="text-[12px] leading-snug"><span className="font-semibold">{TRACK[t].name}.</span> <span className="text-muted-foreground">{info.builds[t]}</span></span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
