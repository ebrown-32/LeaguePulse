/**
 * Is this a real franchise of this league, and what is it called? Asked on
 * the product site before a claim is taken, so nobody can claim an id the
 * league never had. The archive knows every manager of every season; a league
 * not archived yet is checked against its managers as the provider lists them now.
 *
 * Server only.
 */

import type { Tenant } from '@/lib/platform/tenants';

export interface FranchiseInfo { franchiseId: string; teamName: string; manager: string; avatar: string | null; leagueName: string }

export async function franchiseInfo(t: Tenant, franchiseId: string): Promise<FranchiseInfo | null> {
  const { runAsTenant } = await import('@/lib/tenant/context');
  return runAsTenant(t, async () => {
    const { listFranchises } = await import('@/lib/archive/franchises');
    const archived = await listFranchises(t.slug).catch(() => null);
    const hit = archived?.find(f => f.franchiseId === franchiseId);
    if (hit) return { franchiseId, teamName: hit.teamName || hit.manager, manager: hit.manager, avatar: hit.avatar, leagueName: t.leagueName };
    if (archived) return null;
    const { leagueFetch } = await import('@/lib/providers/leagueFetch');
    const users = await leagueFetch(`https://api.sleeper.app/v1/league/${t.leagueId}/users`).then(r => (r.ok ? r.json() : [])).catch(() => []);
    const u = (users as any[]).find(x => String(x?.user_id) === franchiseId);
    return u ? { franchiseId, teamName: u.metadata?.team_name || u.display_name, manager: u.display_name, avatar: null, leagueName: t.leagueName } : null;
  });
}
