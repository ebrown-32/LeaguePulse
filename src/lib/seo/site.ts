/**
 * What a request's host is, for search engines: the product site, the demo league, a customer's
 * league site, or a self-hosted copy. robots.txt, the sitemap, llms.txt and the root layout's
 * metadata all decide from this.
 *
 *   product   leaguepulse.io (and www): indexed, with a sitemap
 *   demo      demo.leaguepulse.io: indexed, the showcase
 *   league    any other league's site: never indexed. Its pages are full of real people's names
 *             and in-jokes, and a league didn't sign up to be found on Google
 *   self      a self-hosted copy: left to its owner, so indexed like any site
 */

import { headers } from 'next/headers';
import { PLATFORM } from '@/lib/platform/config';
import { DEMO_SLUG } from '@/lib/demo/site';

export type SiteKind = 'product' | 'demo' | 'league' | 'self';

export function kindOf(host: string | null): SiteKind {
  if (process.env.LP_HOSTED !== '1') return 'self';
  const h = (host ?? '').toLowerCase().split(':')[0];
  const root = PLATFORM.rootDomain.toLowerCase();
  if (h === root || h === `www.${root}` || h === 'localhost') return 'product';
  if (h === `${DEMO_SLUG}.${root}` || h === `${DEMO_SLUG}.localhost`) return 'demo';
  return 'league';
}

/** The request's host and its origin (https, except locally). */
export async function requestSite(): Promise<{ host: string | null; origin: string; kind: SiteKind }> {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.includes('localhost') ? 'http' : 'https');
  return { host, origin: host ? `${proto}://${host}` : `https://${PLATFORM.rootDomain}`, kind: kindOf(host) };
}
