/**
 * A constitution as its editor sees it: articles, each with an optional
 * introduction and its rules. The stored form is Markdown (an article is a
 * `##` heading, a rule a `###`), so the public page and anything else that
 * reads the document keep working from one source. Pure: the editor in the
 * browser and the server share it.
 */

import { marked } from 'marked';

/**
 * Markdown to HTML for a document an admin wrote and everyone reads: no raw
 * HTML (it is shown as text) and no script links, so the page can never run
 * anything an admin typed.
 */
export function safeMarkdown(md: string): string {
  const html = marked.parse(md.replace(/&/g, '&amp;').replace(/</g, '&lt;'), { async: false }) as string;
  return html.replace(/\s(href|src)="\s*(?:javascript|vbscript|data):[^"]*"/gi, ' $1="#"');
}

export interface Rule { id: string; title: string; body: string }
export interface Article { id: string; title: string; body: string; rules: Rule[] }
export interface ConstitutionDocument {
  /** Text before the first article. */
  preamble: string;
  articles: Article[];
}

let seq = 0;
/** An id for the editor's lists: stable while editing, never stored. */
export const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A body's text, without the horizontal rules once used to space articles apart. */
function clean(lines: string[]): string {
  return lines.join('\n').replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseConstitution(markdown: string): ConstitutionDocument {
  const doc: ConstitutionDocument = { preamble: '', articles: [] };
  let buffer: string[] = [];
  let article: Article | null = null;
  let rule: Rule | null = null;
  const flush = () => {
    const text = clean(buffer);
    buffer = [];
    if (rule) rule.body = text;
    else if (article) article.body = text;
    else doc.preamble = text;
  };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) { buffer.push(line); continue; }
    flush();
    if (m[1].length < 3) {
      article = { id: newId(), title: m[2], body: '', rules: [] };
      doc.articles.push(article);
      rule = null;
    } else {
      // A rule before any article gets an untitled article to live in.
      if (!article) { article = { id: newId(), title: 'General', body: '', rules: [] }; doc.articles.push(article); }
      rule = { id: newId(), title: m[2], body: '' };
      article.rules.push(rule);
    }
  }
  flush();
  return doc;
}

export function serializeConstitution(doc: ConstitutionDocument): string {
  const out: string[] = [];
  if (doc.preamble.trim()) out.push(doc.preamble.trim());
  // A rule or article left completely empty is dropped rather than published as "Untitled".
  const filled = (r: Rule) => Boolean(r.title.trim() || r.body.trim());
  for (const a of doc.articles) {
    const rules = a.rules.filter(filled);
    if (!a.title.trim() && !a.body.trim() && !rules.length) continue;
    out.push(`## ${oneLine(a.title) || 'Untitled article'}`);
    if (a.body.trim()) out.push(a.body.trim());
    for (const r of rules) {
      out.push(`### ${oneLine(r.title) || 'Untitled rule'}`);
      if (r.body.trim()) out.push(r.body.trim());
    }
  }
  return out.join('\n\n') + '\n';
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Bumps the last number of a version ("0.2" to "0.3", "1" to "2"); anything else is left alone. */
export function nextVersion(v: string): string {
  const m = /^(.*?)(\d+)$/.exec(v.trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : v;
}

/** A starting point for a league with no constitution yet: headings and prompts, no rules invented for it. */
export const STARTER = `## League Fees & Prizes

### Entry Fee

How much it costs to play, when it is due, and how it is collected.

### Payouts

Who gets paid, how much, and when.

## Trades

### Trade Review

How trades are reviewed, and what makes a trade unfair.

## Conduct

### Tanking

What counts as tanking, and what happens to a manager who does it.

## Commissioner

### Role & Authority

What the commissioner can decide on their own, and what needs a vote.

## Amendments

### Proposals & Votes

How a rule change is proposed, how many votes it needs, and when it takes effect.
`;
