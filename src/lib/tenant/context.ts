/**
 * Which league a request belongs to.
 *
 * Self-hosted: always none, and every caller falls back to the one league in
 * NEXT_PUBLIC_LEAGUE_ID, exactly as before tenancy existed.
 *
 * Hosted: the league is read from the request's Host, `<slug>.<root domain>`,
 * and looked up in the registry. Never from a header: API routes do not pass
 * through the proxy, so a client could send any header it liked straight to
 * one, and a forged tenant header would read or write another league's data.
 * The Host is what the platform routed on, so it is the one thing to trust.
 *
 * Work that runs outside a request (the AI scheduler fanning out over every
 * league) names its league explicitly with `runAsTenant`, which wins over the
 * Host.
 */

import type { AsyncLocalStorage as ALS } from 'node:async_hooks';
import type { Tenant } from '@/lib/platform/tenants';

/*
 * No static import of `next/headers` or `node:async_hooks`. Client components
 * reach this module through `getCurrentLeagueId()`, and a static import of
 * either drags server-only code into the browser bundle, which fails the
 * build. Both are loaded at runtime, on the server, when first needed.
 */

const hosted = () => process.env.LP_HOSTED === '1';
const rootDomain = () => (process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN ?? 'leaguepulse.app').toLowerCase();

/** The league subdomain in a host, or null for the bare domain. */
export function subdomainOf(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.toLowerCase().split(':')[0];
  if (h.endsWith('.localhost')) return h.slice(0, -'.localhost'.length) || null;
  const root = rootDomain();
  if (h === root || h === `www.${root}` || h === 'localhost') return null;
  if (h.endsWith(`.${root}`)) {
    const sub = h.slice(0, -(root.length + 1));
    // One level only, which is all a wildcard certificate covers.
    return sub && !sub.includes('.') ? sub : null;
  }
  return null;
}

let als: ALS<Tenant | null> | null = null;
function storage(): ALS<Tenant | null> | null {
  if (als) return als;
  // Next puts AsyncLocalStorage on globalThis in every server runtime.
  const Ctor = (globalThis as { AsyncLocalStorage?: new () => ALS<Tenant | null> }).AsyncLocalStorage;
  als = Ctor ? new Ctor() : null;
  return als;
}

/** Run `fn` as a specific league, for work that has no request. */
export function runAsTenant<T>(tenant: Tenant | null, fn: () => Promise<T>): Promise<T> {
  const s = storage();
  if (!s) throw new Error('runAsTenant needs a server runtime');
  return s.run(tenant, fn);
}

/**
 * A short memo of registry lookups. Every database call in a request asks
 * which league it is for, and a page makes dozens.
 */
const memo = new Map<string, { at: number; tenant: Tenant | null }>();
const MEMO_MS = 30_000;

async function lookup(slug: string): Promise<Tenant | null> {
  const hit = memo.get(slug);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.tenant;
  // Imported here, not at the top: the registry reads Redis, and Redis asks
  // this module which league it is serving. Platform keys short-circuit that,
  // but the import cycle is still best kept out of module load.
  const { getTenant } = await import('@/lib/platform/tenants');
  const tenant = await getTenant(slug).catch(() => null);
  memo.set(slug, { at: Date.now(), tenant });
  return tenant;
}

/** The current request's league, or null (self-hosted, the bare domain, or no request). */
export async function currentTenant(): Promise<Tenant | null> {
  if (!hosted()) return null;
  const forced = storage()?.getStore();
  if (forced !== undefined) return forced;
  let host: string | null = null;
  try {
    const { headers } = await import('next/headers');
    host = (await headers()).get('host');
  } catch {
    // Not in a request: a script, a build step, a background job without
    // runAsTenant. No league.
    return null;
  }
  const slug = subdomainOf(host);
  return slug ? lookup(slug) : null;
}

/** For tests and admin changes, so a status change is not served stale. */
export function forgetTenant(slug: string) { memo.delete(slug); }
