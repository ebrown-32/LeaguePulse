import type { MetadataRoute } from 'next';
import { requestSite } from '@/lib/seo/site';

/** The product site's public pages, or the demo league's tour; nothing for a customer's league. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { origin, kind } = await requestSite();
  const now = new Date();
  const at = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'weekly') =>
    ({ url: `${origin}${path}`, lastModified: now, changeFrequency, priority });
  if (kind === 'product') {
    return [at('/', 1), at('/start', 0.8), at('/legal/privacy', 0.2, 'yearly'), at('/legal/terms', 0.2, 'yearly')];
  }
  if (kind === 'demo') {
    return [
      at('/', 0.9, 'daily'), at('/history', 0.7), at('/trades', 0.7, 'daily'), at('/desk', 0.7, 'daily'),
      at('/franchises', 0.6), at('/matchups', 0.6, 'daily'), at('/standings', 0.6, 'daily'), at('/rivalries', 0.5),
      at('/analytics', 0.5), at('/next-gen', 0.5), at('/drafts', 0.4), at('/transactions', 0.4, 'daily'),
    ];
  }
  return [];
}
