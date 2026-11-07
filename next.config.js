/** @type {import('next').NextConfig} */

/**
 * Sent with every page and API response.
 *
 * Framing is refused outright: nothing legitimately embeds these pages, and a
 * framed admin page is how clickjacking works. The rest are the standard
 * hardening headers. HTTPS itself (HSTS) is enforced by Vercel.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/**
 * The one exception: the demo league (demo.<root>), shown live inside the phone on the product
 * site's front page. Only the product site may frame it (and localhost in development); every
 * other site, customers' leagues and every admin page included, is never framed.
 */
const root = (process.env.NEXT_PUBLIC_LP_ROOT_DOMAIN || 'leaguepulse.io').trim();
const demoFramers = [`https://${root}`, `https://www.${root}`, ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*'])];
const demoHeaders = [
  { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${demoFramers.join(' ')}` },
  ...securityHeaders.filter(h => h.key !== 'X-Frame-Options' && h.key !== 'Content-Security-Policy'),
];
const DEMO_HOST = [{ type: 'host', value: 'demo\\..*' }];

const nextConfig = {
  // The dev badge, out of the side rail's corner (bottom left) and the chat button's (bottom right).
  devIndicators: { position: 'top-right' },
  // Whether this is the hosted product, for the client: Franchise HQ (and the
  // stadiums drawn from it) is hosted only, so a self-hosted copy leaves its
  // stadium views out rather than showing empty boxes. Fixed at build time.
  env: { NEXT_PUBLIC_LP_HOSTED: process.env.LP_HOSTED === '1' ? '1' : '' },
  // The share cards' fonts (src/app/api/og), read from disk at request time: every route that
  // draws a card needs them in its bundle, or it fails on Vercel while working locally.
  outputFileTracingIncludes: {
    '/api/og': ['./src/app/api/og/*.woff'],
    '/api/wrapped/card': ['./src/app/api/og/*.woff'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'sleepercdn.com' },
      { protocol: 'https', hostname: 'a.espncdn.com' },
      { protocol: 'https', hostname: 's.espncdn.com' },
      // ESPN fantasy team logos (see src/lib/providers/espn/translate.ts).
      { protocol: 'https', hostname: 'g.espncdn.com' },
    ],
  },
  async headers() {
    return [
      { source: '/:path*', missing: DEMO_HOST, headers: securityHeaders },
      { source: '/:path*', has: DEMO_HOST, headers: demoHeaders },
    ];
  },
};

module.exports = nextConfig;
