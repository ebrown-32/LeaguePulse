'use client';

/**
 * A franchise's manage page: for its manager only. The public face (logo,
 * color, motto, bio) and the business (prices, building, the books), apart
 * from the public franchise page.
 *
 * Getting in takes a manager pass (or the league admin's). Arriving without
 * one, it goes once through the product site, which mints one for the signed-
 * in manager and comes straight back here; anyone else is told so.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil } from '@/components/icons';
import { BackLink, IdentityEditor, fieldLogo, useFranchise } from '../Franchise';
import { Section } from '../Section';
import FranchiseHQ from '../tycoon/FranchiseHQ';

const TRIED = (id: string) => `lp_manage_tried:${id}`;

export default function ManageView({ franchiseId }: { franchiseId: string }) {
  const { info, auth, reload } = useFranchise(franchiseId);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const publicPath = `/team/${encodeURIComponent(franchiseId)}`;

  useEffect(() => {
    fetch('/api/franchises').then(r => (r.ok ? r.json() : null)).then(d => {
      const f = d?.franchises?.find((x: { franchiseId: string }) => x.franchiseId === franchiseId);
      setTeamName(f ? f.teamName || f.manager : 'Your franchise');
    }).catch(() => setTeamName('Your franchise'));
  }, [franchiseId]);

  // No pass in hand: fetch one from the product site, once.
  useEffect(() => {
    if (!info) return;
    if (auth) { try { sessionStorage.removeItem(TRIED(franchiseId)); } catch { /* ignore */ } setChecked(true); return; }
    let tried = false;
    try { tried = sessionStorage.getItem(TRIED(franchiseId)) === '1'; } catch { /* ignore */ }
    if (info.editUrl && !tried) {
      try { sessionStorage.setItem(TRIED(franchiseId), '1'); } catch { /* ignore */ }
      window.location.href = info.editUrl;
      return;
    }
    setChecked(true);
  }, [info, auth, franchiseId]);

  if (!info || !checked || !teamName) {
    return <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8"><div className="h-64 animate-pulse rounded-2xl border border-border bg-card" /></div>;
  }

  if (!auth) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Only this franchise&apos;s manager can manage it.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {info.manager ? 'Log in to LeaguePulse with the account that manages it, then open it again.' : 'Nobody manages it yet. If it is your team, sign up or log in with LeaguePulse to claim it.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {info.claimUrl && <a href={info.claimUrl} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">Sign up / log in with LeaguePulse to claim</a>}
          <a href={publicPath} className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold">View the franchise</a>
        </div>
      </div>
    );
  }

  const color = info.identity.color;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 pb-16 sm:px-6 lg:px-8" style={color ? { ['--team' as string]: color } : undefined}>
      <BackLink fallback={publicPath} label="Franchise page" />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Manage</p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{teamName}</h1>
        </div>
        <a href={publicPath} className="rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">View public page</a>
      </motion.div>
      <FranchiseHQ franchiseId={franchiseId} mode="manage" auth={auth} color={color} teamName={teamName}
        logo={fieldLogo(info.identity.logoUrl, franchiseId)} look={info.identity.look} stadiumName={info.identity.stadiumName} onLookSaved={reload}
        identity={
          <Section scope="manage" id="identity" icon={Pencil} title="Identity" index={1}
            summary={[info.identity.logoUrl ? 'Midfield logo' : 'No midfield logo', info.identity.motto ? `"${info.identity.motto}"` : 'no motto'].join(', ')}>
            <IdentityEditor info={info} auth={auth} teamName={teamName} onSaved={reload} />
          </Section>
        } />
    </div>
  );
}
