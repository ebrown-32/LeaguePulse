import { XMLParser } from 'fast-xml-parser';

export interface RssItem {
  title: string;
  description: string;
  link: string;
  imageUrl?: string;
  published: Date;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImageFromHtml(html: string): string | undefined {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Fetches and parses an RSS 2.0 feed into normalized items. Tolerant of missing/odd fields since feed quality varies by publisher. */
export async function fetchRssFeed(url: string, timeoutMs = 8000): Promise<RssItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LeaguePulse/1.0;)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RSS fetch failed (${response.status}): ${url}`);

    const xml = await response.text();
    const doc = parser.parse(xml);
    const rawItems = asArray(doc?.rss?.channel?.item ?? doc?.feed?.entry);

    const items: RssItem[] = [];
    for (const raw of rawItems) {
      const title = typeof raw.title === 'object' ? raw.title['#text'] : raw.title;
      if (!title) continue;

      const description = typeof raw.description === 'object' ? raw.description['#text'] : raw.description;
      const contentEncoded = raw['content:encoded'];
      const rawDescription = description || contentEncoded || '';

      const link = typeof raw.link === 'object' ? raw.link['@_href'] || raw.link['#text'] : raw.link;

      const mediaContent = raw['media:content'];
      const mediaThumbnail = raw['media:thumbnail'];
      const enclosure = raw.enclosure;
      const imageUrl =
        mediaContent?.['@_url'] ||
        (Array.isArray(mediaContent) ? mediaContent[0]?.['@_url'] : undefined) ||
        mediaThumbnail?.['@_url'] ||
        (enclosure?.['@_type']?.startsWith('image') ? enclosure['@_url'] : undefined) ||
        firstImageFromHtml(String(rawDescription));

      const pubDateRaw = raw.pubDate || raw.published || raw.updated;
      const published = pubDateRaw ? new Date(pubDateRaw) : new Date();

      items.push({
        title: stripHtml(String(title)),
        description: stripHtml(String(rawDescription)).slice(0, 300),
        link: String(link || ''),
        imageUrl,
        published: isNaN(published.getTime()) ? new Date() : published,
      });
    }

    return items;
  } finally {
    clearTimeout(timeout);
  }
}
