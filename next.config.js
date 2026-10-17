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

const nextConfig = {
  // Whether this is the hosted product, for the client: Franchise HQ (and the
  // stadiums drawn from it) is hosted only, so a self-hosted copy leaves its
  // stadium views out rather than showing empty boxes. Fixed at build time.
  env: { NEXT_PUBLIC_LP_HOSTED: process.env.LP_HOSTED === '1' ? '1' : '' },
  // The share card's fonts (src/app/api/og), read from disk at request time.
  outputFileTracingIncludes: { '/api/og': ['./src/app/api/og/*.woff'] },
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
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
