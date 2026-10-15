import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextVersion, parseConstitution, safeMarkdown, serializeConstitution, STARTER } from '../src/lib/constitutionDoc.ts';

const strip = (md: string) => serializeConstitution(parseConstitution(md));

test('articles hold rules, and the text survives a round trip', () => {
  const md = '## Fees\n\nIntro to fees.\n\n### Entry\n\n**$50**, due by\n\n- week 1\n- in cash\n\n## Trades\n\n### Review\n\nTwo days.\n';
  const doc = parseConstitution(md);
  assert.deepEqual(doc.articles.map(a => [a.title, a.body, a.rules.map(r => [r.title, r.body])]), [
    ['Fees', 'Intro to fees.', [['Entry', '**$50**, due by\n\n- week 1\n- in cash']]],
    ['Trades', '', [['Review', 'Two days.']]],
  ]);
  assert.equal(serializeConstitution(doc), md);
});

test('the repository’s constitution loads without losing a rule', () => {
  const raw = readFileSync(new URL('../content/constitution.md', import.meta.url), 'utf8').replace(/^---[\s\S]*?---\n/, '');
  const doc = parseConstitution(raw);
  const headings = raw.match(/^#{2,3} .+$/gm)!.length;
  assert.equal(doc.articles.length + doc.articles.reduce((n, a) => n + a.rules.length, 0), headings);
  assert.equal(strip(strip(raw)), strip(raw)); // stable once the old --- spacers are gone
});

test('empty rules and articles are left out, not published as Untitled', () => {
  const md = serializeConstitution({ preamble: '', articles: [
    { id: 'a', title: 'Fees', body: '', rules: [{ id: 'r1', title: 'Entry', body: '$50' }, { id: 'r2', title: '', body: '  ' }] },
    { id: 'b', title: '', body: '', rules: [{ id: 'r3', title: '', body: '' }] },
  ] });
  assert.equal(md, '## Fees\n\n### Entry\n\n$50\n');
});

test('a rule before any article gets one to live in', () => {
  const doc = parseConstitution('### Lonely\n\nText.');
  assert.equal(doc.articles.length, 1);
  assert.equal(doc.articles[0].rules[0].title, 'Lonely');
});

test('the starter outline invents no rules', () => {
  const doc = parseConstitution(STARTER);
  assert.ok(doc.articles.length >= 4);
  // Every rule body is a prompt for the admin to replace, not a rule.
  for (const r of doc.articles.flatMap(a => a.rules)) assert.match(r.body, /^(How|What|Who)\b/);
});

test('the page never runs anything an admin typed', () => {
  const html = safeMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://example.com) **bold**');
  assert.doesNotMatch(html, /<script|<img|javascript:/i);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test('versions bump their last number', () => {
  assert.equal(nextVersion('0.2'), '0.3');
  assert.equal(nextVersion('1'), '2');
  assert.equal(nextVersion('2.9'), '2.10');
  assert.equal(nextVersion('draft'), 'draft');
});
