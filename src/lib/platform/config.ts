/**
 * The hosted product: LeaguePulse for any Sleeper league, on a subscription.
 *
 * The same codebase runs two ways:
 *
 *   Self-hosted (the default). One league, set by NEXT_PUBLIC_LEAGUE_ID, the
 *   way the open source project has always worked. Nothing in this folder
 *   changes its behaviour.
 *
 *   Hosted (LP_HOSTED=1). The bare domain serves the marketing site and
 *   sign-up; each league lives on its own subdomain, resolved per request.
 *
 * Everything a business decision might change lives here as configuration:
 * the name, the domain, the price. Changing the price is an environment
 * variable, not a deploy.
 */

/**
 * Server-only values. Anything the browser needs is read as a literal
 * `process.env.NEXT_PUBLIC_...` below: Next inlines those into client code only
 * when written out in full, so a lookup by a variable name would show the
 * defaults in the browser whatever was configured.
 */
const env = (k: string, fallback = '') => (process.env[k] ?? fallback).trim();

export const PLATFORM = {
  name: (process.env.NEXT_PUBLIC_LP_PRODUCT_NAME || 'LeaguePulse').trim(),
  hosted: env('LP_HOSTED') === '1',
  /** e.g. "leaguepulse.app". Leagues live at <slug>.<rootDomain>. */
  rootDomain: (process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN || 'leaguepulse.io').trim(),
  github: (process.env.NEXT_PUBLIC_LP_GITHUB_URL || 'https://github.com/ebrown-32/LeaguePulse').trim(),
  /** A live league to show prospects. Optional. */
  demoUrl: (process.env.NEXT_PUBLIC_LP_DEMO_URL || '').trim(),
  supportEmail: (process.env.NEXT_PUBLIC_LP_SUPPORT_EMAIL || '').trim(),
} as const;

/**
 * Plans. Prices are display values; the amounts actually charged come from
 * the Stripe price ids, so the two are set together.
 *
 *   free     Self-hosted: the open source app on the league's own servers.
 *   pro      League Pass: hosted. The AI runs on the league's own Anthropic
 *            key and bills the league directly, so the platform's cost is
 *            flat however chatty a league is.
 *   ai       League Pass + AI: hosted, and the platform runs the AI on its
 *            own key (LP_MANAGED_ANTHROPIC_API_KEY), within the daily limits.
 *   custom   A design engagement, priced per league: an inquiry, not a
 *            checkout.
 *
 * A league's tier is `standard` (League Pass) or `ai` (League Pass + AI);
 * a league with no tier recorded is standard, as every league was before.
 */
export type Tier = 'standard' | 'ai';

export const PLANS = {
  free: {
    id: 'free',
    name: 'Self-hosted',
    price: 0,
    blurb: 'The whole app, free to run yourself. Run it on your own Vercel account.',
  },
  pro: {
    id: 'pro',
    name: 'League Pass',
    monthly: Number(process.env.NEXT_PUBLIC_LP_PRICE_MONTHLY || 8),
    /**
     * A year, billed yearly. A season runs about five months, so a league paying monthly only in
     * season pays about the same as a year: the yearly price is the better deal.
     */
    season: Number(process.env.NEXT_PUBLIC_LP_PRICE_SEASON || 39),
    stripeMonthly: env('STRIPE_PRICE_MONTHLY'),
    stripeSeason: env('STRIPE_PRICE_SEASON'),
    trialDays: Number(process.env.NEXT_PUBLIC_LP_TRIAL_DAYS || 14),
    blurb: 'Hosted for you, on your own address. The AI runs on your own Anthropic key.',
  },
  ai: {
    id: 'ai',
    name: 'League Pass + AI',
    monthly: Number(process.env.NEXT_PUBLIC_LP_PRICE_AI_MONTHLY || 16),
    season: Number(process.env.NEXT_PUBLIC_LP_PRICE_AI_SEASON || 79),
    stripeMonthly: env('STRIPE_PRICE_AI_MONTHLY'),
    stripeSeason: env('STRIPE_PRICE_AI_SEASON'),
    blurb: 'Everything in League Pass, and we run the AI. No key, no second bill.',
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    blurb: 'A site designed around your league, built with you.',
  },
} as const;

/** The plan record for a tier. */
export const tierPlan = (tier: Tier) => (tier === 'ai' ? PLANS.ai : PLANS.pro);

/** The Stripe price for a tier and billing cycle ('' when not configured). */
export const stripePriceFor = (tier: Tier, cycle: 'monthly' | 'season') =>
  cycle === 'monthly' ? tierPlan(tier).stripeMonthly : tierPlan(tier).stripeSeason;

/**
 * Prices no longer sold that subscriptions may still be on, by tier and cycle: comma-separated
 * Stripe price ids in STRIPE_PRICE_MONTHLY_OLD, STRIPE_PRICE_SEASON_OLD, STRIPE_PRICE_AI_MONTHLY_OLD
 * and STRIPE_PRICE_AI_SEASON_OLD. A league on one keeps its tier until it's moved to the current
 * price (api/platform/operator/reprice).
 */
const oldPrices = (name: string) => env(name).split(',').map(s => s.trim()).filter(Boolean);
export const LEGACY_PRICES: { tier: Tier; plan: 'monthly' | 'season'; ids: string[] }[] = [
  { tier: 'standard', plan: 'monthly', ids: oldPrices('STRIPE_PRICE_MONTHLY_OLD') },
  { tier: 'standard', plan: 'season', ids: oldPrices('STRIPE_PRICE_SEASON_OLD') },
  { tier: 'ai', plan: 'monthly', ids: oldPrices('STRIPE_PRICE_AI_MONTHLY_OLD') },
  { tier: 'ai', plan: 'season', ids: oldPrices('STRIPE_PRICE_AI_SEASON_OLD') },
];

/** A Stripe price id back to its tier and cycle, or null for a price this product does not sell. */
export function priceInfo(priceId: string | null | undefined): { tier: Tier; plan: 'monthly' | 'season' } | null {
  if (!priceId) return null;
  if (priceId === PLANS.pro.stripeMonthly) return { tier: 'standard', plan: 'monthly' };
  if (priceId === PLANS.pro.stripeSeason) return { tier: 'standard', plan: 'season' };
  if (priceId === PLANS.ai.stripeMonthly) return { tier: 'ai', plan: 'monthly' };
  if (priceId === PLANS.ai.stripeSeason) return { tier: 'ai', plan: 'season' };
  const old = LEGACY_PRICES.find(l => l.ids.includes(priceId));
  return old ? { tier: old.tier, plan: old.plan } : null;
}

/** Subdomains a league may not take. */
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'start', 'signup', 'login', 'billing', 'help',
  'support', 'operator', 'account', 'accounts', 'sign-in', 'sign-up', 'clerk', 'clkmail', 'docs', 'blog', 'status', 'mail', 'static', 'assets', 'cdn', 'demo', 'leaguepulse',
]);

/** Lowercase letters, numbers and single hyphens, 3 to 32 characters. */
export function validSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(s) && !s.includes('--') && !RESERVED_SLUGS.has(s);
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '');
}
