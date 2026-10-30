import type { MetadataRoute } from 'next';
import { requestSite } from '@/lib/seo/site';

/**
 * robots.txt, per host (lib/seo/site): the product site and the demo are open to every crawler,
 * AI assistants' included, apart from pages that are private or useless in search; a customer's
 * league site is closed.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { origin, kind } = await requestSite();
  if (kind === 'league') return { rules: { userAgent: '*', disallow: '/' } };
  const privatePaths = ['/api/', '/admin', '/operator', '/account', '/start/done', '/start/pending', '/start/recover', '/sign-in', '/sign-up'];
  return {
    rules: { userAgent: '*', allow: '/', disallow: privatePaths },
    ...(kind === 'self' ? {} : { sitemap: `${origin}/sitemap.xml`, host: origin }),
  };
}
