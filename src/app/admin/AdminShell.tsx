'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PageLayout } from '@/components/layout/PageLayout';

import TabSelector from '@/components/ui/TabSelector';
import AppearanceEditor from './appearance/AppearanceEditor';
import AIDeskAdmin from './ai-desk/AIDeskAdmin';
import LeagueDataAdmin from './data/LeagueDataAdmin';
import YourData from './export/YourData';
import ManagersAdmin from './managers/ManagersAdmin';
import ConstitutionAdmin from './constitution/ConstitutionAdmin';
import RankingsAdmin from './rankings/RankingsAdmin';
import BillingCard from '@/components/admin/BillingCard';
import EspnConnectionCard from '@/components/admin/EspnConnectionCard';

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
  { id: 'data',       label: 'League data', blurb: 'Fill in what the platform didn’t keep, and add older seasons.' },
  { id: 'managers',   label: 'Managers',    blurb: 'Who runs each franchise, and claims waiting for your answer.' },
  { id: 'constitution', label: 'Constitution', blurb: 'The league’s rules: write them, change them, and keep every version.' },
  { id: 'rankings',   label: 'Rankings',    blurb: 'Expert player rankings from FantasyPros, on your league’s own key.' },
  { id: 'export',     label: 'Your data',   blurb: 'Every season, kept for good. Download it any time.' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const STORAGE_KEY = 'lp_admin_tab';
const PASS_KEY = 'lp_admin_pass';
/**
 * Set for this tab once signed in, however: not a secret, only a hint for the
 * league's pages to show their admin shortcuts (the constitution's Edit, the
 * rankings' Connect). Every save is still checked by the server.
 */
export const ADMIN_HINT_KEY = 'lp_admin_seen';

/**
 * On a hosted league, the product site's "open this league's admin" link, so
 * an owner can sign in with their account instead of a password. Null on a
 * self-hosted copy, which has no accounts.
 */
function productAccountLink(): string | null {
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  const { hostname, port, protocol } = window.location;
  const [slug, ...rest] = hostname.split('.');
  if (!rest.length) return null;
  const root = rest.join('.');
  const origin = root === 'localhost' ? `${protocol}//localhost${port ? `:${port}` : ''}` : `https://${root}`;
  return `${origin}/api/platform/account/open?slug=${encodeURIComponent(slug)}`;
}

export default function AdminShell() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('appearance');
  // Claims waiting on the league's franchises, counted on the Managers tab.
  const [pending, setPending] = useState(0);
  useEffect(() => {
    if (!authed || !password) return;
    fetch('/api/admin/franchises', { headers: { 'x-admin-password': password }, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setPending(d.pending.length); })
      .catch(() => {});
  }, [authed, password]);

  // Remember the tab so a save-and-reload does not bounce you back. A link
  // can name one (/admin?tab=constitution), which wins.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('tab');
    const saved = asked ?? localStorage.getItem(STORAGE_KEY);
    if (TABS.some(t => t.id === saved)) setTab(saved as Tab);
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, tab); }, [tab]);

  const login = useCallback(async (given = password) => {
    if (!given) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: given }),
      });
      if (res.ok) {
        setPassword(given); setAuthed(true);
        try { sessionStorage.setItem(ADMIN_HINT_KEY, '1'); } catch { /* ignore */ }
      }
      else if (given.startsWith('lpt.')) {
        try { sessionStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
        setPassword('');
        setError('That sign-in has expired. Open the admin again from your account.');
      } else setError('Incorrect password.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }, [password]);

  /**
   * Hosted: arriving from "Open admin" on the account page, with a signed
   * pass in the URL fragment. It stands in for the password for this tab
   * (see lib/platform/adminPass); the fragment is cleared straight away.
   */
  useEffect(() => {
    let pass: string | null = null;
    const m = /[#&]lpt=([^&]+)/.exec(window.location.hash);
    if (m) {
      pass = decodeURIComponent(m[1]);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      try { sessionStorage.setItem(PASS_KEY, pass); } catch { /* ignore */ }
    } else {
      try { pass = sessionStorage.getItem(PASS_KEY); } catch { /* ignore */ }
    }
    if (pass) login(pass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Worked out after mount: it depends on the address in the browser, and
  // computing it during render made the server and client HTML differ.
  const [account, setAccount] = useState<string | null>(null);
  // Focus the password on desktop only, after mount so the server and browser render alike.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setAccount(productAccountLink());
    if (window.matchMedia('(pointer: fine)').matches) field.current?.focus();
  }, []);

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
            ref={field}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          <button
            onClick={() => login()}
            disabled={busy || !password}
            className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? 'Signing in…' : 'Unlock'}
          </button>
          {account && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
              </div>
              <a href={account} className="block w-full rounded-md border border-border py-2 text-center text-sm font-semibold text-foreground hover:bg-muted">
                Sign in with your LeaguePulse account
              </a>
            </>
          )}
          {/* Set only on the hosted product, where the operator can issue a
              recovery link. Self-hosted, the password is ADMIN_PASSWORD. */}
          {process.env.NEXT_PUBLIC_LP_SUPPORT_EMAIL && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Forgot it? Email{' '}
              <a className="text-primary" href={`mailto:${process.env.NEXT_PUBLIC_LP_SUPPORT_EMAIL}?subject=Admin%20password%20reset`}>
                {process.env.NEXT_PUBLIC_LP_SUPPORT_EMAIL}
              </a>{' '}
              from the address you signed up with.
            </p>
          )}
        </div>
      </PageLayout>
    );
  }

  const active = TABS.find(t => t.id === tab)!;

  return (
    <PageLayout title="Admin" subtitle={active.blurb}>
      {/* ESPN leagues only: first, because a broken connection is the thing to fix. */}
      <EspnConnectionCard password={password} />
      <div className="mb-6">
        <TabSelector
          id="admin"
          aria-label="Admin section"
          value={tab}
          onChange={setTab}
          options={TABS.map(t => ({ id: t.id, label: t.id === 'managers' && pending ? `${t.label} (${pending})` : t.label }))}
        />
      </div>

      {/* Both editors stay mounted-on-demand rather than always: the theme
          editor writes live CSS variables while open, which should not happen
          from behind another tab. */}
      {tab === 'appearance' && <AppearanceEditor adminPassword={password} />}
      {tab === 'ai' && <AIDeskAdmin adminPassword={password} />}
      {tab === 'data' && <LeagueDataAdmin adminPassword={password} />}
      {tab === 'managers' && <ManagersAdmin adminPassword={password} onChange={setPending} />}
      {tab === 'export' && <YourData adminPassword={password} />}
      {tab === 'constitution' && <ConstitutionAdmin adminPassword={password} />}
      {tab === 'rankings' && <RankingsAdmin adminPassword={password} />}
      <BillingCard password={password} />
    </PageLayout>
  );
}
