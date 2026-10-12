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
 * Each league brings its own Anthropic key and pays Anthropic directly for its
 * AI, so the subscription covers hosting, the product and support, not model
 * usage. That keeps the platform's costs flat however chatty a league is.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'Self-hosted',
    price: 0,
    blurb: 'The whole app, open source. Run it on your own Vercel account.',
  },
  pro: {
    id: 'pro',
    name: 'League Pass',
    monthly: Number(process.env.NEXT_PUBLIC_LP_PRICE_MONTHLY || 12),
    /** A season runs about five months; the season price is the better deal. */
    season: Number(process.env.NEXT_PUBLIC_LP_PRICE_SEASON || 49),
    stripeMonthly: env('STRIPE_PRICE_MONTHLY'),
    stripeSeason: env('STRIPE_PRICE_SEASON'),
    trialDays: Number(process.env.NEXT_PUBLIC_LP_TRIAL_DAYS || 14),
    blurb: 'Hosted for you, on your own address. The AI runs on your own Anthropic key.',
  },
} as const;

/** Subdomains a league may not take. */
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'dashboard', 'start', 'signup', 'login', 'billing', 'help',
  'support', 'operator', 'docs', 'blog', 'status', 'mail', 'static', 'assets', 'cdn', 'demo', 'leaguepulse',
]);

/** Lowercase letters, numbers and single hyphens, 3 to 32 characters. */
export function validSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(s) && !s.includes('--') && !RESERVED_SLUGS.has(s);
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/g, '');
}
