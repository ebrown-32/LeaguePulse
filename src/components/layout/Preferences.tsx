'use client';

/**
 * A visitor's own preferences (lib/prefs): light or dark, motion, click sounds, haptics, League
 * Wrapped's music and the live scores bar. Each starts at the league's setting (the admin's
 * appearance panel, marked on <html data-league-*>) and a switch overrides it for this browser.
 *
 * In the desktop rail's footer as a popover, and in the phone menu as a section.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import { Moon, Music, Pointer, Radio, RotateCcw, Sun, Vibrate, Wind } from '@/components/icons';
import { cn } from '@/lib/utils';
import { setPrefs, usePrefs, type Prefs } from '@/lib/prefs';

function league(name: 'sound' | 'haptics' | 'motion'): string | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.dataset[`league${name[0].toUpperCase()}${name.slice(1)}`];
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        on ? 'bg-primary' : 'bg-muted-foreground/25')}>
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)]', on ? 'right-[3px]' : 'left-[3px]')} />
    </button>
  );
}

function Row({ icon: I, label, sub, on, onChange }: { icon: React.ComponentType<{ className?: string }>; label: string; sub: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <span className={cn('lp-chip h-8 w-8 shrink-0 rounded-lg [&>svg]:h-4 [&>svg]:w-4', !on && 'lp-chip-muted')}><I /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        <span className="block text-[11.5px] text-muted-foreground">{sub}</span>
      </span>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

export default function PreferencesPanel({ className }: { className?: string }) {
  const prefs = usePrefs();
  const { resolvedTheme, setTheme } = useTheme();
  const [canVibrate, setCanVibrate] = useState(false);
  useEffect(() => { setCanVibrate(typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.maxTouchPoints > 0); }, []);

  const motionReduced = (prefs.motion ?? league('motion')) === 'reduced';
  const sound = prefs.sound ?? league('sound') === 'on';
  const haptics = prefs.haptics ?? league('haptics') !== 'off';
  const set = (p: Partial<Prefs>) => setPrefs(p);
  const custom = Object.keys(prefs).length > 0;
  const isDark = resolvedTheme === 'dark';

  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative grid grid-cols-2 rounded-xl bg-muted/60 p-1">
        {(['light', 'dark'] as const).map(mode => {
          const on = (mode === 'dark') === isDark;
          const I = mode === 'dark' ? Moon : Sun;
          return (
            <button key={mode} type="button" onClick={() => setTheme(mode)} aria-pressed={on}
              className={cn('relative flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors', on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {on && <motion.span layoutId="prefs-theme" className="absolute inset-0 rounded-lg bg-card shadow-sm ring-1 ring-border/70" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
              <I className="relative h-3.5 w-3.5" />
              <span className="relative capitalize">{mode}</span>
            </button>
          );
        })}
      </div>

      <div className="pt-1">
        <Row icon={Wind} label="Reduce motion" sub="Calmer pages, fewer animations" on={motionReduced}
          onChange={on => set({ motion: on ? 'reduced' : 'full' })} />
        <Row icon={Pointer} label="Click sounds" sub="A soft tick on every tap" on={sound} onChange={on => set({ sound: on })} />
        {canVibrate && <Row icon={Vibrate} label="Haptics" sub="Feel each tap" on={haptics} onChange={on => set({ haptics: on })} />}
        <Row icon={Music} label="Wrapped music" sub="The soundtrack in League Wrapped" on={prefs.music !== false} onChange={on => set({ music: on ? undefined : false })} />
        <Row icon={Radio} label="Live scores bar" sub="Every matchup while games are on" on={prefs.liveStrip !== false} onChange={on => set({ liveStrip: on ? undefined : false })} />
      </div>

      {custom && (
        <button type="button" onClick={() => set({ sound: undefined, haptics: undefined, motion: undefined, music: undefined, liveStrip: undefined })}
          className="mx-2 mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
          <RotateCcw className="h-3 w-3" /> Back to the league&apos;s settings
        </button>
      )}
    </div>
  );
}
