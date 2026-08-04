import { NextResponse } from 'next/server';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';

export const dynamic = 'force-dynamic';

// jsdom parses full pages, keep this off the edge runtime.
export const runtime = 'nodejs';

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
// Measured after collapsing whitespace, since a page full of empty nested
// divs can rack up hundreds of "characters" of pure newlines/indentation
// that look substantial by raw .length but render as nothing. Set well
// above a gambling-disclaimer footer's length (~530 chars) — ESPN's video
// pages have no real article body, and that boilerplate is often the only
// substantial text block Readability finds, so a low threshold treats it
// as "the article".
const MIN_EXTRACTED_LENGTH = 900;
const BOILERPLATE_SIGNATURES = ['GAMBLING PROBLEM', '1-800-GAMBLER', 'draftkings.com/sportsbook', 'Void in ONT'];

const purifyWindow = new JSDOM('').window;
const purify = DOMPurify(purifyWindow as unknown as Window & typeof globalThis);

function visibleLength(text: string | null | undefined): number {
  return (text || '').replace(/\s+/g, ' ').trim().length;
}

// Catches "content" that's actually a headline-rail widget (timestamps +
// bylines, no real sentences) that slipped past the length/link checks —
// real prose has a sentence-ending punctuation mark roughly every
// 100-200 characters; a wall of "5h Tristan H. Cockcroft 33d ..." has
// almost none.
function looksLikeProse(text: string): boolean {
  if (BOILERPLATE_SIGNATURES.some(sig => text.includes(sig))) return false;

  // Middle-initial abbreviations ("Tristan H. Cockcroft") aren't sentence
  // boundaries but match a naive period check — strip them first so a wall
  // of byline stubs doesn't get miscounted as real sentences.
  const withoutInitials = text.replace(/\b[A-Z]\.(?=\s)/g, '');
  const sentenceEnders = (withoutInitials.match(/[.!?](\s|$)/g) || []).length;
  if (sentenceEnders < Math.max(3, withoutInitials.length / 250)) return false;

  // ESPN's "related headlines" rail renders as unspaced "<time><byline>"
  // pairs — e.g. "...Cockcroft33dTristan H...." — which reads as prose by
  // punctuation alone but is a compact "6h"/"33d" timestamp wedged between
  // two names on every single entry. Real articles essentially never
  // produce that letter-digits-letter pattern more than once or twice.
  const timestampSeams = (text.match(/[a-z]\d{1,3}[hd][A-Z]/g) || []).length;
  return timestampSeams < 3;
}

// Sports sites frequently open the article body with a "related headlines"
// widget that shares the same content wrapper Readability scores as the
// article. It isn't always a semantic <ul> — some sites build it out of
// plain <div>s — so the real signal is "mostly links, not much prose",
// checked and stripped from the front until a real paragraph is reached.
// Fraction of an element's visible text that lives inside <a> tags. Real
// prose with a couple of inline player links still reads mostly as plain
// text (low ratio); a "related headlines" rail is close to 100% link text
// with almost nothing in between entries.
function anchorTextRatio(el: Element): number {
  const totalText = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!totalText.length) return 0;
  const anchorText = Array.from(el.querySelectorAll('a'))
    .map(a => (a.textContent || '').replace(/\s+/g, ' ').trim())
    .join(' ');
  return anchorText.length / totalText.length;
}

function stripLeadingNoise(html: string): string {
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root')!;

  while (root.firstElementChild) {
    const el = root.firstElementChild;
    const linkCount = el.querySelectorAll('a').length;
    const looksLikeLinkList = linkCount >= 3 && anchorTextRatio(el) > 0.6;
    const isKnownNoiseTag = ['UL', 'OL', 'NAV'].includes(el.tagName);

    if (looksLikeLinkList || (isKnownNoiseTag && linkCount > 0)) {
      root.removeChild(el);
    } else {
      break;
    }
  }

  return root.innerHTML;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return NextResponse.json(cached.data);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeaguePulse/1.0;)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Source fetch failed: ${response.status}`);
    const html = await response.text();

    const dom = new JSDOM(html, { url });

    // ESPN's "related headlines" rail (id="news-feed") sometimes out-scores
    // the real article body in Readability's own heuristics and gets
    // extracted instead of it. Removing the node before parsing just makes
    // Readability pick a *different* wrong candidate (its scoring depends on
    // sibling structure), so instead measure it non-destructively up front
    // and compare against whatever Readability ends up choosing.
    const newsFeedTextLen = visibleLength(dom.window.document.querySelector('#news-feed')?.textContent);

    const article = new Readability(dom.window.document).parse();
    const articleTextLen = visibleLength(article?.textContent);
    const dominatedByFeedWidget = newsFeedTextLen > 200 && newsFeedTextLen / Math.max(articleTextLen, 1) > 0.4;

    // Checked against Readability's own .textContent (adjacent elements
    // concatenate with no inserted whitespace) rather than the later
    // tag-stripped display text, where every tag boundary becomes a space
    // and erases the exact "name+timestamp+name" adjacency this looks for.
    if (!article?.content || articleTextLen < MIN_EXTRACTED_LENGTH || dominatedByFeedWidget || !looksLikeProse(article.textContent || '')) {
      const data = { available: false };
      cache.set(url, { data, ts: Date.now() });
      return NextResponse.json(data);
    }

    const trimmedContent = stripLeadingNoise(article.content);

    // Links inside extracted content would let a reader tap through to yet
    // another external page — omitting <a> from ALLOWED_TAGS unwraps them
    // to plain text instead, so the reader never has anywhere else to go.
    const cleanHtml = purify.sanitize(trimmedContent, {
      ALLOWED_TAGS: ['p', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'img', 'figure', 'figcaption', 'br'],
      ALLOWED_ATTR: ['src', 'alt'],
    });

    const finalText = cleanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (finalText.length < MIN_EXTRACTED_LENGTH) {
      const data = { available: false };
      cache.set(url, { data, ts: Date.now() });
      return NextResponse.json(data);
    }

    const data = {
      available: true,
      title: article.title,
      byline: article.byline,
      content: cleanHtml,
    };
    cache.set(url, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[api/media/article-content]', error);
    return NextResponse.json({ available: false });
  }
}
