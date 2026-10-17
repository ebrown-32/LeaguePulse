'use client';

/**
 * The league's subscription, on the hosted product. Renders nothing on a
 * self-hosted copy, where the billing endpoint answers 404.
 */

import { useEffect, useState } from 'react';

interface Billing { status: string; plan: string; canManage: boolean; supportEmail: string | null }

const STATUS: Record<string, string> = {
  trialing: 'Free trial', active: 'Active', past_due: 'Payment failed, retrying', canceled: 'Cancelled',
};

export default function BillingCard({ password }: { password: string }) {
  const [info, setInfo] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/platform/billing', { headers: { 'x-admin-password': password } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d?.hosted && setInfo(d))
      .catch(() => {});
  }, [password]);

  if (!info) return null;

  const open = async () => {
    setBusy(true); setError('');
    const r = await fetch('/api/platform/billing', { method: 'POST', headers: { 'x-admin-password': password } }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok && d?.url) window.location.href = d.url;
    else { setBusy(false); setError(d?.error ?? 'Could not open billing.'); }
  };

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">Subscription</p>
        <p className="text-sm font-semibold text-foreground">
          League Pass, {info.plan === 'season' ? 'season' : 'monthly'} · {STATUS[info.status] ?? info.status}
        </p>
      </div>
      {info.canManage ? (
        <button onClick={open} disabled={busy}
          className="min-h-10 sm:min-h-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50">
          {busy ? 'Opening…' : 'Manage billing'}
        </button>
      ) : info.supportEmail ? (
        <a href={`mailto:${info.supportEmail}`} className="text-xs text-primary">Contact support</a>
      ) : null}
      {error && <p className="w-full text-xs text-rose-500">{error}</p>}
    </div>
  );
}
