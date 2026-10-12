'use client';

import { useState } from 'react';
import { ArrowRight, Check } from '@/components/icons';

export default function RecoverAdmin({ token, siteUrl }: { token: string; siteUrl: string }) {
  const [pw, setPw] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setState('saving'); setError(null);
    const r = await fetch('/api/platform/recover/complete', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password: pw }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) setState('done');
    else { setState('idle'); setError(d?.error ?? 'Could not save'); }
  };

  if (state === 'done') {
    return (
      <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left text-[13.5px]">
        <p className="flex items-center gap-2 font-semibold text-primary"><Check className="h-4 w-4" /> New password saved</p>
        <p className="mt-1 text-muted-foreground">
          Sign in at <a href={`${siteUrl}/admin`} className="font-semibold text-foreground">{siteUrl.replace('https://', '')}/admin</a>.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); save(); }} className="mt-6 text-left">
      <div className="flex gap-2">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required placeholder="New password, at least 8 characters"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background/70 px-3 py-2.5 text-[14px] outline-none focus:border-primary/60" />
        <button disabled={state === 'saving' || pw.length < 8}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50">
          Save <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-red-600">{error}</p>}
    </form>
  );
}
