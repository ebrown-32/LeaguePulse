'use client';

import { useCallback, useEffect, useState } from 'react';

import { PageLayout } from '@/components/layout/PageLayout';

import TabSelector from '@/components/ui/TabSelector';
import AppearanceEditor from './appearance/AppearanceEditor';
import AIDeskAdmin from './ai-desk/AIDeskAdmin';

/**
 * The single admin panel.
 *
 * Appearance and the AI desk used to be separate routes with a password gate
 * each, so configuring the app meant signing in twice. The gate lives here now
 * and both editors are rendered as tabs beneath it; they receive the verified
 * password as a prop rather than collecting it again.
 */

const TABS = [
  { id: 'appearance', label: 'Appearance', blurb: 'Palette, fonts, background and motion.' },
  { id: 'ai',         label: 'AI Desk',    blurb: 'Personalities, publishing and diagnostics.' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const STORAGE_KEY = 'lp_admin_tab';

export default function AdminShell() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('appearance');

  // Remember the tab so a save-and-reload does not bounce you back.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (TABS.some(t => t.id === saved)) setTab(saved as Tab);
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, tab); }, [tab]);

  const login = useCallback(async () => {
    if (!password) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) setAuthed(true);
      else setError('Incorrect password.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }, [password]);

  if (!authed) {
    return (
      <PageLayout title="Admin" subtitle="Sign in to configure LeaguePulse.">
        <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-6">
          <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="admin-pw">
            Admin password
          </label>
          <input
            id="admin-pw"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            // Desktop only. Focusing a field on mount raises the keyboard
            // immediately on a phone, which is jarring and, on iOS, was
            // itself enough to trigger the viewport zoom.
            autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <button
            onClick={login}
            disabled={busy || !password}
            className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Signing in…' : 'Unlock'}
          </button>
        </div>
      </PageLayout>
    );
  }

  const active = TABS.find(t => t.id === tab)!;

  return (
    <PageLayout title="Admin" subtitle={active.blurb}>
      <div className="mb-6">
        <TabSelector
          id="admin"
          aria-label="Admin section"
          value={tab}
          onChange={setTab}
          options={TABS.map(t => ({ id: t.id, label: t.label }))}
        />
      </div>

      {/* Both editors stay mounted-on-demand rather than always: the theme
          editor writes live CSS variables while open, which should not happen
          from behind another tab. */}
      {tab === 'appearance' && <AppearanceEditor adminPassword={password} />}
      {tab === 'ai' && <AIDeskAdmin adminPassword={password} />}
    </PageLayout>
  );
}
