'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, ArrowPathIcon, LockClosedIcon, EyeIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import type { ThemeConfig, FontPairKey } from '@/lib/themeConfig';
import { accentPresets, fontPairs } from '@/lib/themeConfig';
import { cn } from '@/lib/utils';

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexToHsl(hex: string): { h: number; s: number } | null {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return { h: 0, s: 0 };
  const d = max - min;
  const l = (max + min) / 2;
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const RADIUS_OPTIONS = [
  { label: 'Sharp',   value: 0 },
  { label: 'Soft',    value: 0.5 },
  { label: 'Rounded', value: 0.75 },
  { label: 'Pill',    value: 1 },
];

// ─── Mini preview card ────────────────────────────────────────────────────────

function Preview({ h, s, radius }: { h: number; s: number; radius: number }) {
  const accent = `hsl(${h} ${s}% 44%)`;
  return (
    <div
      className="rounded-lg overflow-hidden border border-border text-[13px] bg-card"
      style={{ ['--preview-accent' as any]: accent, ['--preview-radius' as any]: `${radius}rem` }}
    >
      {/* Mini navbar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 bg-background">
        <div className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <span className="font-semibold text-foreground text-xs">League Pulse</span>
        <div className="ml-auto flex items-center gap-2">
          {['Overview','Matchups','History'].map((n, i) => (
            <span key={n} className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded',
              i === 0 ? 'text-foreground' : 'text-muted-foreground',
            )}
            style={i === 0 ? { background: `hsl(${h} ${s}% 44% / 0.12)`, color: accent } : {}}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 p-4">
        {[
          { l: 'Season Status', v: 'In Season' },
          { l: 'League Size',   v: '10 Teams'  },
          { l: 'Current Week',  v: 'Week 12'   },
        ].map(({ l, v }) => (
          <div
            key={l}
            className="rounded border border-border bg-background p-3 flex items-center gap-2"
            style={{ borderRadius: `${radius}rem` }}
          >
            <div className="h-6 w-6 rounded shrink-0 flex items-center justify-center"
              style={{ background: `hsl(${h} ${s}% 44% / 0.12)`, borderRadius: `calc(${radius}rem - 2px)` }}>
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{l}</p>
              <p className="text-[11px] font-bold text-foreground">{v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Standings preview */}
      <div className="px-4 pb-4 space-y-1">
        {[
          { name: 'Team Alpha',  w: 9, l: 3 },
          { name: 'Team Beta',   w: 7, l: 5 },
          { name: 'Team Gamma',  w: 6, l: 6 },
        ].map((t, i) => (
          <div key={t.name}
            className="flex items-center gap-2 rounded px-3 py-1.5 border-l-2"
            style={{
              borderRadius: `${Math.min(radius, 0.375)}rem`,
              borderLeftColor: i < 2 ? accent : 'transparent',
              background: i < 2 ? `hsl(${h} ${s}% 44% / 0.04)` : 'transparent',
            }}
          >
            <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
            <div className="h-4 w-4 rounded-full bg-muted shrink-0" />
            <span className="text-[10px] font-medium text-foreground flex-1">{t.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{t.w}-{t.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AppearancePage() {
  const router = useRouter();

  const [authed,    setAuthed]    = useState(false);
  const [password,  setPassword]  = useState('');
  const [authError, setAuthError] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [theme, setTheme] = useState<ThemeConfig>({
    primaryH:   177,
    primaryS:   89,
    radiusRem:  0.5,
    fontPair:   'bricolage-dm',
    logoUrl:    null,
    leagueName: null,
  });

  const [customHex, setCustomHex] = useState(
    hslToHex(theme.primaryH, theme.primaryS, 44),
  );

  // Load current theme once authenticated
  const loadTheme = useCallback(async (pwd: string) => {
    const res = await fetch('/api/admin/theme', {
      headers: { 'x-admin-password': pwd },
    });
    if (res.ok) {
      const data = await res.json();
      setTheme(data);
      setCustomHex(hslToHex(data.primaryH, data.primaryS, 44));
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthed(true);
        await loadTheme(password);
      } else {
        setAuthError('Incorrect password.');
      }
    } catch {
      setAuthError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(theme),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // Re-run server components (ThemeInjector) so the new theme is applied immediately
      router.refresh();
    } catch {
      setSaveError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/admin/theme', {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        const defaults = await res.json();
        setTheme(defaults);
        setCustomHex(hslToHex(defaults.primaryH, defaults.primaryS, 44));
      }
    } finally {
      setResetting(false);
    }
  };

  const setAccent = (h: number, s: number) => {
    setTheme(t => ({ ...t, primaryH: h, primaryS: s }));
    setCustomHex(hslToHex(h, s, 44));
  };

  const handleCustomColor = (hex: string) => {
    setCustomHex(hex);
    const hsl = hexToHsl(hex);
    if (hsl) setTheme(t => ({ ...t, primaryH: hsl.h, primaryS: hsl.s }));
  };

  // ── Login gate ──
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-lg border border-border bg-card p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <LockClosedIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold text-foreground">Appearance</h1>
                <p className="text-xs text-muted-foreground">Admin access required</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Admin password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="
                    w-full rounded-md border border-border bg-background px-3 py-2
                    text-sm text-foreground placeholder:text-muted-foreground
                    focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                  "
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              {authError && (
                <p className="text-xs text-destructive">{authError}</p>
              )}
              <button
                type="submit"
                disabled={loading || !password}
                className="
                  w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground
                  hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Editor ──
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <EyeIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Appearance</h1>
              <p className="text-sm text-muted-foreground">Customize your league's look and feel</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="
                  inline-flex items-center gap-1.5 rounded-md border border-border
                  bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground
                  hover:text-foreground disabled:opacity-40
                "
              >
                <ArrowPathIcon className={cn('h-3.5 w-3.5', resetting && 'animate-spin')} />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="
                  inline-flex items-center gap-1.5 rounded-md bg-primary
                  px-4 py-1.5 text-sm font-semibold text-primary-foreground
                  hover:opacity-90 disabled:opacity-40
                "
              >
                <AnimatePresence mode="wait" initial={false}>
                  {saved ? (
                    <motion.span
                      key="saved"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5"
                    >
                      <CheckIcon className="h-3.5 w-3.5" /> Saved!
                    </motion.span>
                  ) : (
                    <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      Save changes
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
            {saveError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" />
                {saveError}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Controls */}
          <div className="space-y-6">

            {/* ── Accent color ── */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Accent Color</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Used for active states, highlights, and interactive elements
                </p>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                {accentPresets.map((p) => {
                  const isActive = theme.primaryH === p.h && theme.primaryS === p.s;
                  return (
                    <button
                      key={p.name}
                      onClick={() => setAccent(p.h, p.s)}
                      title={p.name}
                      className={cn(
                        'group relative h-8 w-8 rounded-full border-2 transition-none',
                        isActive ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                      )}
                      style={{ background: hslToHex(p.h, p.s, 44) }}
                    >
                      {isActive && (
                        <CheckIcon className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom picker */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-muted-foreground">Custom color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customHex}
                    onChange={e => handleCustomColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <input
                    type="text"
                    value={customHex}
                    onChange={e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) handleCustomColor(e.target.value); setCustomHex(e.target.value); }}
                    className="
                      w-24 rounded border border-border bg-background px-2 py-1 text-xs
                      font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary
                    "
                    placeholder="#0dd8cf"
                    maxLength={7}
                  />
                </div>
              </div>
            </section>

            {/* ── Border radius ── */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Border Radius</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Controls the roundness of cards, buttons, and inputs</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {RADIUS_OPTIONS.map(({ label, value }) => {
                  const isActive = theme.radiusRem === value;
                  return (
                    <button
                      key={label}
                      onClick={() => setTheme(t => ({ ...t, radiusRem: value }))}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-md border p-3 text-xs font-medium transition-none',
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-border/80',
                      )}
                    >
                      {/* Visual swatch */}
                      <div
                        className="h-8 w-full border-2 border-current"
                        style={{ borderRadius: `${Math.max(value, 0.125)}rem` }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Font pairing ── */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Font Pairing</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Display font for headings, body font for content</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.entries(fontPairs) as [FontPairKey, typeof fontPairs[FontPairKey]][]).map(([key, pair]) => {
                  const isActive = theme.fontPair === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setTheme(t => ({ ...t, fontPair: key }))}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-md border p-4 text-left transition-none',
                        isActive
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background hover:border-border/80',
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className={cn('text-xs font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
                          {pair.preview}
                        </span>
                        {isActive && <CheckIcon className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-lg font-bold text-foreground leading-tight">{pair.display}</p>
                      <p className="text-xs text-muted-foreground">{pair.body}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── League identity ── */}
            <section className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">League Identity</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Override the league name and logo shown in the UI</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={theme.leagueName ?? ''}
                    onChange={e => setTheme(t => ({ ...t, leagueName: e.target.value || null }))}
                    placeholder="Overrides name from Sleeper"
                    className="
                      w-full rounded-md border border-border bg-background px-3 py-2
                      text-sm text-foreground placeholder:text-muted-foreground
                      focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                    "
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Logo URL
                  </label>
                  <input
                    type="url"
                    value={theme.logoUrl ?? ''}
                    onChange={e => setTheme(t => ({ ...t, logoUrl: e.target.value || null }))}
                    placeholder="https://example.com/logo.png"
                    className="
                      w-full rounded-md border border-border bg-background px-3 py-2
                      text-sm text-foreground placeholder:text-muted-foreground
                      focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                    "
                  />
                  {theme.logoUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={theme.logoUrl} alt="Logo preview" className="h-8 w-8 rounded object-contain border border-border" />
                      <span className="text-xs text-muted-foreground">Preview</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Live preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live Preview</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="sticky top-20">
              <Preview h={theme.primaryH} s={theme.primaryS} radius={theme.radiusRem} />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Changes are reflected above instantly. Save to apply site-wide.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
