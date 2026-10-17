'use client';

/**
 * An ESPN league's connection, at the top of its admin page.
 *
 * Shows nothing for a Sleeper league. For ESPN: whether data is coming
 * through and when it last did, and a place to paste new cookies when ESPN
 * has signed the old ones out (about once a year). New cookies are tested
 * against ESPN before they are saved.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, AlertTriangle } from '@/components/icons';

interface Health { ok: boolean; kind?: 'auth' | 'not_found' | 'unavailable'; message?: string; at: number; lastOkAt?: number }
interface Status {
  provider: 'sleeper' | 'espn';
  mode?: 'hosted' | 'self-hosted';
  espnLeagueId?: string;
  hasCredentials?: boolean;
  health?: Health | null;
}

function ago(t?: number): string {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default function EspnConnectionCard({ password }: { password: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [swid, setSwid] = useState('');
  const [s2, setS2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Working, the card is a status line; the form opens to replace the cookies (and stays open when something is wrong).
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/espn', { headers: { 'x-admin-password': password } }).catch(() => null);
    if (r?.ok) setStatus(await r.json());
  }, [password]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/admin/espn', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify({ swid, s2 }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) { setSwid(''); setS2(''); setMsg({ ok: true, text: 'Connected. Your league is up to date.' }); load(); }
    else setMsg({ ok: false, text: d?.error ?? 'Could not save them' });
  };

  if (!status || status.provider !== 'espn') return null;
  const h = status.health;
  const broken = h && !h.ok;
  const signedOut = broken && h.kind === 'auth';

  return (
    <section className={`mb-6 rounded-xl border p-4 ${broken ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-card'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-foreground">ESPN connection</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            League {status.espnLeagueId} on ESPN. Scores refresh every few minutes on game days.
          </p>
        </div>
        {broken ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> {signedOut ? 'ESPN signed us out' : 'ESPN not answering'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Connected · updated {ago(h?.lastOkAt ?? h?.at)}
          </span>
        )}
      </div>

      {broken && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-foreground">
          {signedOut
            ? 'ESPN no longer accepts the cookies this site reads your league with. The site is showing the last scores it had. Paste fresh ones below to fix it.'
            : `The site is showing the last scores it had (from ${ago(h?.lastOkAt)}). This usually clears up on its own.`}
        </p>
      )}

      {status.mode === 'hosted' && !broken && status.hasCredentials && !open ? (
        <button onClick={() => setOpen(true)} className="mt-2 min-h-10 rounded-lg px-1 text-[12.5px] font-semibold text-primary hover:underline sm:min-h-0">
          Update cookies
        </button>
      ) : status.mode === 'hosted' ? (
        <form onSubmit={e => { e.preventDefault(); save(); }} className="mt-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={swid} onChange={e => setSwid(e.target.value)} placeholder="SWID" autoComplete="off" spellCheck={false}
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-primary/60" />
            <input type="password" value={s2} onChange={e => setS2(e.target.value)} placeholder="espn_s2" autoComplete="off" spellCheck={false}
              className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-primary/60" />
            <button disabled={busy || !swid.trim() || !s2.trim()} className="rounded-lg bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? 'Checking' : status.hasCredentials ? 'Replace and test' : 'Connect and test'}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Signed in at fantasy.espn.com on a computer: developer tools, then Application (Storage in Firefox and Safari), Cookies,
            fantasy.espn.com. Copy <b>SWID</b> and <b>espn_s2</b>. Stored encrypted, only used to read your league, never shown again.
          </p>
        </form>
      ) : (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          Self-hosted: the cookies are <code className="font-mono text-foreground">ESPN_SWID</code> and <code className="font-mono text-foreground">ESPN_S2</code> in the environment.
        </p>
      )}
      {msg && <p className={`mt-2 text-[12px] ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text}</p>}
    </section>
  );
}
