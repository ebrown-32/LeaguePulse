'use client';

/**
 * The league's Anthropic key, in the AI Desk admin.
 *
 * Hosted: the league brings its own key and pays Anthropic directly. Saving
 * tests the key with a one token call first, so a typo never gets stored.
 * Self-hosted: the key is an environment variable; this only says whether it
 * is set.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, AlertTriangle, ExternalLink, Trash2 } from '@/components/icons';

interface Status { mode: 'hosted' | 'self-hosted'; configured: boolean; fingerprint: string | null; managed?: boolean }

export default function AIKeyCard({ password, onChange }: { password: string; onChange?: (configured: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ownKey, setOwnKey] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/ai-key', { headers: { 'x-admin-password': password } }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setStatus(d); onChange?.(d.configured); }
  }, [password, onChange]);
  useEffect(() => { load(); }, [load]);

  const save = async (remove = false) => {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/admin/ai-key', {
      method: remove ? 'DELETE' : 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-password': password },
      body: remove ? undefined : JSON.stringify({ key }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setKey('');
      setMsg({ ok: true, text: remove ? 'Key removed. The AI desk is paused.' : `Saved and tested${d?.note ? `: ${d.note}` : ''}.` });
      load();
    } else {
      setMsg({ ok: false, text: [d?.error, d?.fix].filter(Boolean).join(' ') || 'Could not save the key' });
    }
  };

  if (!status) return null;

  if (status.mode === 'self-hosted') {
    return status.configured ? null : (
      <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-amber-500">AI is not configured. </span>
        Add <code className="font-mono text-foreground">ANTHROPIC_API_KEY</code> to the environment.
      </div>
    );
  }

  // League Pass + AI with no key of its own: the AI is included, nothing to set up.
  if (status.managed && !status.fingerprint && !ownKey) {
    return (
      <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-[13px] font-semibold text-foreground">AI is included</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            On League Pass + AI the desk, chat assistant and analytics questions run on us. Nothing to set up.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Running
          </span>
          <button onClick={() => setOwnKey(true)} className="text-[11.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Use your own key instead
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Your Anthropic API key</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            The AI desk, chat assistant and analytics questions run on your own key, billed by Anthropic directly.
            Cost depends on how much your league chats with it; set a monthly cap in your Anthropic account.
          </p>
        </div>
        {status.configured ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Active · {status.fingerprint}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Not set: AI is off
          </span>
        )}
      </div>
      <form onSubmit={e => { e.preventDefault(); save(); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" spellCheck={false}
          placeholder={status.configured ? 'Paste a new key to replace it' : 'sk-ant-...'}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus:border-primary/60" />
        <button disabled={busy || !key.trim()} className="rounded-lg bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? 'Testing' : 'Save and test'}
        </button>
        {status.configured && (
          <button type="button" onClick={() => save(true)} disabled={busy}
            className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-[12.5px] text-muted-foreground hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </form>
      {msg && <p className={`mt-2 text-[12px] ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{msg.text}</p>}
      <p className="mt-3 text-[11.5px] text-muted-foreground">
        Create one at{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary">
          console.anthropic.com <ExternalLink className="h-3 w-3" />
        </a>
        . Set a monthly spend limit there too. The key is encrypted at rest and never shown again.
      </p>
    </section>
  );
}
