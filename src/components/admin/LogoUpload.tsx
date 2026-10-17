'use client';

import { useRef, useState } from 'react';
import { fileToLogoDataUri } from '@/lib/logoClient';

/** Upload or remove the league logo. Saves straight away, separate from the theme's Save button. */
export default function LogoUpload({
  password, logoUrl, onChange,
}: { password: string; logoUrl: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(method: 'PUT' | 'DELETE', body?: string) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/admin/logo', {
        method,
        headers: { 'content-type': 'application/json', 'x-admin-password': password },
        body,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      onChange(json.logoUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      await send('PUT', JSON.stringify({ dataUri: await fileToLogoDataUri(file) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="min-h-10 sm:min-h-0 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
      >
        {busy ? 'Saving…' : logoUrl ? 'Replace logo' : 'Upload logo'}
      </button>
      {logoUrl && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send('DELETE')}
          className="min-h-10 sm:min-h-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Remove
        </button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
