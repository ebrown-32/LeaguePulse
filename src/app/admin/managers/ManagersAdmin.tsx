'use client';

/**
 * Managers, in the admin: claims on the league's franchises waiting for an
 * answer, who manages which franchise now, and a way into any franchise to edit
 * its identity and stadium as the admin. See lib/franchise.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pencil, Users } from '@/components/icons';
import type { Claim } from '@/lib/franchise/model';

interface Invite { franchiseId: string; teamName: string; email: string; invitedAt: string; link: string }
interface Overview {
  invites: Invite[];
  pending: Claim[];
  recent: Claim[];
  managers: { franchiseId: string; teamName: string; name: string; email: string }[];
}

const STATUS: Record<string, string> = { approved: 'Approved', declined: 'Declined', withdrawn: 'Withdrawn' };

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ManagersAdmin({ adminPassword, onChange }: { adminPassword: string; onChange?: (pending: number) => void }) {
  const headers = useMemo(() => ({ 'content-type': 'application/json', 'x-admin-password': adminPassword }), [adminPassword]);
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [teams, setTeams] = useState<{ franchiseId: string; name: string; managed: boolean }[]>([]);
  const [inviteTeam, setInviteTeam] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/franchises').then(r => (r.ok ? r.json() : null)).then(d => {
      if (d?.franchises) setTeams(d.franchises.filter((f: { active: boolean }) => f.active).map((f: { franchiseId: string; teamName: string | null; manager: string; managed: boolean }) => ({
        franchiseId: f.franchiseId, name: f.teamName ? `${f.teamName} (${f.manager})` : f.manager, managed: f.managed,
      })));
    }).catch(() => {});
  }, []);
  const copy = async (inv: Invite) => {
    try { await navigator.clipboard.writeText(inv.link); setCopied(inv.franchiseId); setTimeout(() => setCopied(null), 2000); } catch { /* the link is shown to copy by hand */ }
  };

  const show = useCallback((d: Overview) => { setData(d); onChange?.(d.pending.length); }, [onChange]);
  useEffect(() => {
    fetch('/api/admin/franchises', { headers, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(show)
      .catch(() => setError('Could not load claims.'));
  }, [headers, show]);

  const act = async (key: string, body: object): Promise<boolean> => {
    setBusy(key); setError('');
    const r = await fetch('/api/admin/franchises', { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    const ok = Boolean(r?.ok && d);
    if (ok) show(d); else setError(d?.error ?? 'That did not work. Try again.');
    setBusy(null);
    return ok;
  };

  if (!data) {
    return error
      ? <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{error}</p>
      : <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Claims waiting</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Managers claim their team from its franchise page. Approve the right person and they can set the franchise&apos;s logo, color, motto and bio. A league admin claiming their own team, and anyone you invite, is approved straight away. Each person manages one team.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          <AnimatePresence initial={false}>
            {data.pending.map(c => (
              <motion.div key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{c.name} <span className="font-normal text-muted-foreground">wants</span> {c.teamName}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{c.email}, {ago(c.at)}</p>
                    {c.note && <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-[13.5px] leading-relaxed">&ldquo;{c.note}&rdquo;</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => act(c.id, { action: 'decline', claimId: c.id })} disabled={busy === c.id}
                      className="rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">Decline</button>
                    <button onClick={() => act(c.id, { action: 'approve', claimId: c.id })} disabled={busy === c.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background hover:bg-foreground/85 disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" />Approve
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {!data.pending.length && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[13.5px] text-muted-foreground">Nothing waiting.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold tracking-tight">Invite a manager</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Pick their team and the email they use for LeaguePulse, then send them the link. When they sign in with that email and open it, they manage the team, no approval needed.
        </p>
        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          onSubmit={e => { e.preventDefault(); if (inviteTeam && inviteEmail) act('invite', { action: 'invite', franchiseId: inviteTeam, email: inviteEmail }).then(ok => { if (ok) setInviteEmail(''); }); }}>
          <select value={inviteTeam} onChange={e => setInviteTeam(e.target.value)} required
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
            <option value="">Their team</option>
            {teams.filter(t => !t.managed && !data.invites.some(i => i.franchiseId === t.franchiseId)).map(t => <option key={t.franchiseId} value={t.franchiseId}>{t.name}</option>)}
          </select>
          <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="Their email"
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <button disabled={busy === 'invite'} className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60">Create invite</button>
        </form>
        {data.invites.length > 0 && (
          <ul className="mt-4 space-y-2">
            {data.invites.map(inv => (
              <li key={inv.franchiseId} className="rounded-xl border border-border bg-background p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[14px]"><span className="font-semibold">{inv.teamName}</span> <span className="text-muted-foreground">for {inv.email}</span></p>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => copy(inv)} className="rounded-full bg-foreground px-3.5 py-1.5 text-[12.5px] font-semibold text-background">{copied === inv.franchiseId ? 'Copied' : 'Copy link'}</button>
                    <button onClick={() => act(inv.franchiseId, { action: 'cancel-invite', franchiseId: inv.franchiseId })} disabled={busy === inv.franchiseId}
                      className="rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                </div>
                <p className="mt-2 break-all rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">{inv.link}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold tracking-tight">Managers</h3>
        <div className="mt-3 divide-y divide-border">
          {data.managers.map(m => (
            <div key={m.franchiseId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-semibold">{m.teamName}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">{m.name}, {m.email}</p>
              </div>
              <button onClick={() => { if (confirm(`Remove ${m.name} as manager of ${m.teamName}?`)) act(m.franchiseId, { action: 'remove', franchiseId: m.franchiseId }); }}
                disabled={busy === m.franchiseId}
                className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">Remove</button>
            </div>
          ))}
          {!data.managers.length && <p className="py-3 text-[13.5px] text-muted-foreground">No franchise has a manager yet.</p>}
        </div>
        {data.recent.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-muted-foreground">Earlier claims</summary>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-muted-foreground">
              {data.recent.map(c => <li key={c.id}>{c.name} for {c.teamName}: {STATUS[c.status] ?? c.status}, {ago(c.decidedAt ?? c.at)}</li>)}
            </ul>
          </details>
        )}
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold tracking-tight">Edit a franchise</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Change any team&apos;s logo, color, motto, bio, stadium name and stadium, managed or not. Prices and building stay with each team&apos;s manager, and your edits don&apos;t post to the Feed as the team.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {teams.map(t => (
            // The same tab: the admin sign-in is this tab's, and the franchise page reads it from here.
            <a key={t.franchiseId} href={`/team/${encodeURIComponent(t.franchiseId)}/manage`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 transition hover:border-foreground/30">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{t.name}</span>
                <span className="block text-[12px] text-muted-foreground">{t.managed ? 'Has a manager' : 'No manager yet'}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground group-hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </span>
            </a>
          ))}
          {!teams.length && <p className="text-[13.5px] text-muted-foreground">No teams found yet.</p>}
        </div>
      </section>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
