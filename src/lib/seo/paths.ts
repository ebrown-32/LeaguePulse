/**
 * The product site's guide pages (lib/seo/pages), by address. Kept apart, with no imports, so the
 * request proxy can treat them as product pages without loading their copy.
 */
export const SEO_SLUGS = [
  'sleeper-league-website',
  'espn-fantasy-league-website',
  'fantasy-football-trade-finder',
  'fantasy-league-record-book',
  'how-to-make-a-fantasy-football-league-website',
] as const;

export type SeoSlug = (typeof SEO_SLUGS)[number];
