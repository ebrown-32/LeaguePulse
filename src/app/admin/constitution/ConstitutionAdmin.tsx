'use client';

/**
 * The constitution editor. Articles hold rules; each is a title and text with
 * light formatting. Reorder, add and remove freely, preview it as the league
 * will read it, then publish: every published version is kept, so any earlier
 * one can be brought back. Work in progress is kept in this browser until it
 * is published or thrown away.
 *
 * The stored form is Markdown (lib/constitutionDoc), which the Markdown view
 * shows as is for anyone who prefers to write it directly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, Clock, ExternalLink, Plus, RotateCcw, Sparkles, Trash2, X } from '@/components/icons';
import {
  newId, nextVersion, parseConstitution, safeMarkdown, serializeConstitution, STARTER,
  type Article, type ConstitutionDocument, type Rule,
} from '@/lib/constitutionDoc';

interface Stored { markdown: string; version: string; description: string | null; lastUpdated: string; savedAt: string }
interface Revision extends Stored { note: string | null }
type Source = 'saved' | 'file' | 'none';

const EASE = [0.22, 1, 0.36, 1] as const;
const DRAFT_KEY = 'lp_constitution_draft';
interface Draft { markdown: string; description: string; basedOn: string; at: string }

const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function ConstitutionAdmin({ adminPassword }: { adminPassword: string }) {
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<Source>('none');
  const [saved, setSaved] = useState<Stored | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [doc, setDoc] = useState<ConstitutionDocument | null>(null);
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'edit' | 'markdown' | 'preview'>('edit');
  const [rawText, setRawText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const headers = useMemo(() => ({ 'x-admin-password': adminPassword, 'content-type': 'application/json' }), [adminPassword]);

  const adopt = useCallback((d: { doc: Stored | null; source: Source; history: Revision[] }) => {
    setSource(d.source); setSaved(d.doc); setHistory(d.history);
    setDoc(d.doc ? parseConstitution(d.doc.markdown) : null);
    setDescription(d.doc?.description ?? '');
  }, []);

  useEffect(() => {
    fetch('/api/admin/constitution', { headers, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (d) {
        adopt(d);
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          const kept = raw ? (JSON.parse(raw) as Draft) : null;
          // Offered back only if it differs from what is published.
          if (kept && kept.markdown !== (d.doc?.markdown ?? '')) setDraft(kept); else localStorage.removeItem(DRAFT_KEY);
        } catch { /* none */ }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [headers, adopt]);

  const markdown = useMemo(() => (mode === 'markdown' ? rawText : doc ? serializeConstitution(doc) : ''), [doc, mode, rawText]);
  // Against the saved text as the editor writes it, so formatting alone (a repository file's spacing) is not a change.
  const baseline = useMemo(() => (saved ? serializeConstitution(parseConstitution(saved.markdown)) : ''), [saved]);
  const dirty = doc !== null && (serializeConstitution(parseConstitution(markdown)) !== baseline || description.trim() !== (saved?.description ?? ''));

  // Keep work in progress in this browser.
  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ markdown, description, basedOn: saved?.savedAt ?? '', at: new Date().toISOString() } satisfies Draft)); } catch { /* full */ }
    }, 600);
    return () => clearTimeout(id);
  }, [dirty, markdown, description, saved]);

  const switchMode = (next: typeof mode) => {
    if (next === mode) return;
    if (mode === 'markdown') setDoc(parseConstitution(rawText));
    if (next === 'markdown') setRawText(doc ? serializeConstitution(doc) : '');
    setMode(next);
  };

  const discard = () => {
    setDoc(saved ? parseConstitution(saved.markdown) : null);
    setDescription(saved?.description ?? '');
    setRawText(saved?.markdown ?? '');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* none */ }
  };

  const loadInto = (md: string, desc: string | null) => {
    setDoc(parseConstitution(md)); setRawText(md); setDescription(desc ?? '');
  };

  if (!loaded) return <div className="h-72 animate-pulse rounded-2xl border border-border bg-card" />;

  return (
    <div className="space-y-4 pb-28">
      {/* Where the document stands */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><BookOpen className="h-[17px] w-[17px]" /></span>
          <div>
            <p className="text-[14.5px] font-semibold">
              {source === 'saved' ? `Published, version ${saved!.version}` : source === 'file' ? `From the repository, version ${saved!.version}` : 'Not written yet'}
            </p>
            <p className="text-[12.5px] text-muted-foreground">
              {source === 'saved' ? `Last published ${fmtDate(saved!.savedAt)}` : source === 'file' ? 'Publish here to keep it with the league from now on.' : 'The constitution page shows only the league settings until you publish.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">
              <Clock className="h-3.5 w-3.5" /> History
            </button>
          )}
          <a href="/constitution" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition hover:text-foreground">
            View page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <AnimatePresence>
        {draft && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px]">
            <span>You have unpublished changes from {new Date(draft.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</span>
            <span className="flex gap-2">
              <button onClick={() => { loadInto(draft.markdown, draft.description); setDraft(null); }} className="rounded-full bg-foreground px-3.5 py-1.5 font-semibold text-background">Pick up where you left off</button>
              <button onClick={() => { setDraft(null); try { localStorage.removeItem(DRAFT_KEY); } catch { /* none */ } }} className="rounded-full px-3 py-1.5 font-semibold text-muted-foreground hover:text-foreground">Throw away</button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!doc ? (
        <StartCard onStart={md => loadInto(md, null)} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block min-w-0 flex-1 sm:max-w-md">
              <span className="text-[12.5px] font-medium text-muted-foreground">One line under the title</span>
              <input value={description} onChange={e => setDescription(e.target.value)} maxLength={200} placeholder="The official rules and bylaws of the league."
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14.5px] outline-none transition focus:border-foreground/40" />
            </label>
            <Segmented value={mode} onChange={switchMode} options={[['edit', 'Edit'], ['markdown', 'Markdown'], ['preview', 'Preview']]} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
              {mode === 'edit' && <Editor doc={doc} onChange={setDoc} />}
              {mode === 'markdown' && (
                <div className="rounded-2xl border border-border bg-card p-1.5">
                  <AutoGrow value={rawText} onChange={setRawText} minRows={18} className="font-mono text-[13px] leading-relaxed" placeholder="## Article&#10;&#10;### Rule&#10;&#10;Text of the rule." />
                  <p className="px-3 pb-2 pt-1 text-[11.5px] text-muted-foreground">Two hashes start an article, three start a rule. **Bold**, *italic*, lists and links work.</p>
                </div>
              )}
              {mode === 'preview' && <Preview markdown={markdown} description={description} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      <PublishBar show={dirty} current={saved?.version ?? null} headers={headers} markdown={markdown} description={description}
        onDiscard={discard} onPublished={d => { adopt(d); setMode(m => (m === 'markdown' ? 'edit' : m)); try { localStorage.removeItem(DRAFT_KEY); } catch { /* none */ } }} />

      <HistoryDrawer open={showHistory} onClose={() => setShowHistory(false)} history={history}
        onRestore={r => { loadInto(r.markdown, r.description); setMode('edit'); setShowHistory(false); }} />
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="relative inline-flex rounded-full border border-border bg-card p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
          className={cn('relative z-10 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', value === v ? 'text-background' : 'text-muted-foreground hover:text-foreground')}>
          {value === v && <motion.span layoutId="constitution-mode" className="absolute inset-0 -z-10 rounded-full bg-foreground" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          {label}
        </button>
      ))}
    </div>
  );
}

function StartCard({ onStart }: { onStart: (markdown: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="rounded-2xl border border-border bg-card p-6 text-center sm:p-10">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><BookOpen className="h-5 w-5" /></span>
      <h3 className="mt-4 font-display text-xl font-bold tracking-tight">Write your league&apos;s constitution</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        The settings from your league (roster, scoring, playoffs) already show on the page. This is for everything else: fees, trades, conduct, and how rules change.
      </p>
      <div className="mt-6 grid gap-3 text-left sm:mx-auto sm:max-w-lg sm:grid-cols-2">
        <button onClick={() => onStart(STARTER)} className="group rounded-xl border border-border p-4 transition hover:border-foreground/30 hover:bg-muted/40">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="mt-2 text-[14px] font-semibold">Start from an outline</p>
          <p className="text-[12.5px] text-muted-foreground">The usual articles, each with a prompt to replace.</p>
        </button>
        <button onClick={() => onStart('## Article 1\n\n### Rule 1\n')} className="group rounded-xl border border-border p-4 transition hover:border-foreground/30 hover:bg-muted/40">
          <Plus className="h-4 w-4 text-primary" />
          <p className="mt-2 text-[14px] font-semibold">Start blank</p>
          <p className="text-[12.5px] text-muted-foreground">One empty article. Build it your way.</p>
        </button>
      </div>
    </motion.div>
  );
}

// ── The structured editor ───────────────────────────────────────────────────

function move<T>(list: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function Editor({ doc, onChange }: { doc: ConstitutionDocument; onChange: (d: ConstitutionDocument) => void }) {
  const setArticle = (i: number, a: Article | null) => {
    const articles = [...doc.articles];
    if (a) articles[i] = a; else articles.splice(i, 1);
    onChange({ ...doc, articles });
  };
  const add = () => onChange({ ...doc, articles: [...doc.articles, { id: newId(), title: '', body: '', rules: [{ id: newId(), title: '', body: '' }] }] });
  return (
    <div className="space-y-3">
      {doc.preamble && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Preamble</p>
          <RichText value={doc.preamble} onChange={preamble => onChange({ ...doc, preamble })} placeholder="Text before the first article." />
        </div>
      )}
      <AnimatePresence initial={false}>
        {doc.articles.map((a, i) => (
          <motion.div key={a.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}>
            <ArticleCard n={i + 1} article={a} first={i === 0} last={i === doc.articles.length - 1}
              onChange={next => setArticle(i, next)} onMove={by => onChange({ ...doc, articles: move(doc.articles, i, by) })} />
          </motion.div>
        ))}
      </AnimatePresence>
      <motion.button layout onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-[14px] font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
        <Plus className="h-4 w-4" /> Add an article
      </motion.button>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={cn('flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
        danger ? 'hover:text-destructive' : 'hover:text-foreground')}>
      {children}
    </button>
  );
}

function ArticleCard({ n, article, first, last, onChange, onMove }: {
  n: number; article: Article; first: boolean; last: boolean; onChange: (a: Article | null) => void; onMove: (by: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [intro, setIntro] = useState(Boolean(article.body));
  const setRule = (i: number, r: Rule | null) => {
    const rules = [...article.rules];
    if (r) rules[i] = r; else rules.splice(i, 1);
    onChange({ ...article, rules });
  };
  const empty = !article.title.trim() && !article.body.trim() && article.rules.every(r => !r.title.trim() && !r.body.trim());

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button onClick={() => setOpen(o => !o)} aria-label={open ? 'Collapse article' : 'Expand article'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
          <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.25 }}><ChevronDown className="h-4 w-4" /></motion.span>
        </button>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Article {n}</span>
        <input value={article.title} onChange={e => onChange({ ...article, title: e.target.value })} placeholder="Article title"
          className="min-w-0 flex-1 bg-transparent px-1 font-display text-[17px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/60" />
        {!open && <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:inline">{article.rules.length} rule{article.rules.length === 1 ? '' : 's'}</span>}
        <div className="flex shrink-0 items-center">
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Delete article" danger onClick={() => (empty ? onChange(null) : setConfirm(true))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {confirm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-destructive/5 px-4 py-2.5 text-[13px]">
            <span>Delete this article and its {article.rules.length} rule{article.rules.length === 1 ? '' : 's'}?</span>
            <span className="flex gap-2">
              <button onClick={() => onChange(null)} className="rounded-full bg-destructive px-3.5 py-1.5 font-semibold text-white">Delete</button>
              <button onClick={() => setConfirm(false)} className="rounded-full px-3 py-1.5 font-semibold text-muted-foreground hover:text-foreground">Keep it</button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <div className="space-y-2.5 border-t border-border/70 px-3 pb-4 pt-3 sm:px-4">
              {intro ? (
                <RichText value={article.body} onChange={body => onChange({ ...article, body })} placeholder="An introduction to this article (optional)." />
              ) : (
                <button onClick={() => setIntro(true)} className="text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">+ Add an introduction</button>
              )}
              <AnimatePresence initial={false}>
                {article.rules.map((r, i) => (
                  <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                    <RuleCard rule={r} first={i === 0} last={i === article.rules.length - 1}
                      onChange={next => setRule(i, next)} onMove={by => onChange({ ...article, rules: move(article.rules, i, by) })} />
                  </motion.div>
                ))}
              </AnimatePresence>
              <button onClick={() => onChange({ ...article, rules: [...article.rules, { id: newId(), title: '', body: '' }] })}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-semibold text-primary hover:bg-primary/10">
                <Plus className="h-3.5 w-3.5" /> Add a rule
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function RuleCard({ rule, first, last, onChange, onMove }: { rule: Rule; first: boolean; last: boolean; onChange: (r: Rule | null) => void; onMove: (by: number) => void }) {
  return (
    <div className="group rounded-xl border border-border/80 bg-background/60 p-3 transition-colors focus-within:border-foreground/25">
      <div className="flex items-center gap-1">
        <input value={rule.title} onChange={e => onChange({ ...rule, title: e.target.value })} placeholder="Rule title"
          className="min-w-0 flex-1 bg-transparent px-1 text-[14.5px] font-semibold outline-none placeholder:text-muted-foreground/60" />
        <div className="flex shrink-0 items-center opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton label="Move rule up" onClick={() => onMove(-1)} disabled={first}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Move rule down" onClick={() => onMove(1)} disabled={last}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Delete rule" danger onClick={() => onChange(null)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>
      <RichText value={rule.body} onChange={body => onChange({ ...rule, body })} placeholder="What the rule says." />
    </div>
  );
}

// ── Text with light formatting ──────────────────────────────────────────────

function AutoGrow({ value, onChange, minRows = 3, className, placeholder, inputRef }: {
  value: string; onChange: (v: string) => void; minRows?: number; className?: string; placeholder?: string; inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? own;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, ref]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} rows={minRows} placeholder={placeholder}
      className={cn('block w-full resize-none rounded-xl bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground/60', className)} />
  );
}

const TOOLS: { label: string; glyph: React.ReactNode; wrap?: [string, string]; line?: (i: number) => string; link?: true }[] = [
  { label: 'Bold', glyph: <b>B</b>, wrap: ['**', '**'] },
  { label: 'Italic', glyph: <i className="font-serif">I</i>, wrap: ['*', '*'] },
  { label: 'Bulleted list', glyph: <span className="text-[15px] leading-none">•</span>, line: () => '- ' },
  { label: 'Numbered list', glyph: <span className="text-[11px] font-bold">1.</span>, line: i => `${i + 1}. ` },
  { label: 'Link', glyph: <span className="text-[11px] font-bold underline">a</span>, link: true },
];

function RichText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b);
    let next = value, caret: [number, number] = [a, b];
    if (tool.wrap) {
      const [l, r] = tool.wrap;
      next = value.slice(0, a) + l + (picked || tool.label.toLowerCase()) + r + value.slice(b);
      caret = [a + l.length, a + l.length + (picked || tool.label.toLowerCase()).length];
    } else if (tool.link) {
      const text = picked || 'link text';
      next = `${value.slice(0, a)}[${text}](https://)${value.slice(b)}`;
      const at = a + text.length + 3;
      caret = [at, at + 8];
    } else if (tool.line) {
      const start = value.lastIndexOf('\n', a - 1) + 1;
      const block = value.slice(start, b).split('\n').map((l, i) => tool.line!(i) + l.replace(/^(\s*)(?:[-*]|\d+\.)\s+/, '$1')).join('\n');
      next = value.slice(0, start) + block + value.slice(b);
      caret = [start, start + block.length];
    }
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(...caret); });
  };
  return (
    <div className="mt-1.5 rounded-xl border border-border/80 bg-card transition-colors focus-within:border-foreground/30">
      <div className="flex items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        {TOOLS.map(t => (
          <button key={t.label} type="button" onMouseDown={e => e.preventDefault()} onClick={() => apply(t)} title={t.label} aria-label={t.label}
            className="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground">
            {t.glyph}
          </button>
        ))}
      </div>
      <AutoGrow inputRef={ref} value={value} onChange={onChange} placeholder={placeholder} className="text-[14px] leading-relaxed" />
    </div>
  );
}

// ── Preview, publishing and history ─────────────────────────────────────────

function Preview({ markdown, description }: { markdown: string; description: string }) {
  const sections = useMemo(() => {
    const out: { level: number; title: string; html: string }[] = [];
    for (const a of parseConstitution(markdown).articles) {
      out.push({ level: 2, title: a.title, html: a.body ? safeMarkdown(a.body) : '' });
      for (const r of a.rules) out.push({ level: 3, title: r.title, html: r.body ? safeMarkdown(r.body) : '' });
    }
    return out;
  }, [markdown]);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">As the league will read it</p>
      {description.trim() && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      {sections.map((s, i) => (
        <section key={i}>
          {s.level === 2
            ? <><h2 className="mb-3 mt-8 text-xl font-semibold text-foreground">{s.title || 'Untitled article'}</h2><div className="mb-4 h-px bg-border" /></>
            : <h3 className="mb-2 mt-6 pl-1 text-base font-semibold text-foreground/80">{s.title || 'Untitled rule'}</h3>}
          <div className="prose-section" dangerouslySetInnerHTML={{ __html: s.html }} />
        </section>
      ))}
    </div>
  );
}

function PublishBar({ show, current, headers, markdown, description, onDiscard, onPublished }: {
  show: boolean; current: string | null; headers: Record<string, string>; markdown: string; description: string;
  onDiscard: () => void; onPublished: (d: { doc: Stored; source: Source; history: Revision[] }) => void;
}) {
  const [version, setVersion] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { if (show) setVersion(current ? nextVersion(current) : '1.0'); }, [show, current]);

  const publish = async () => {
    setBusy(true); setError('');
    const r = await fetch('/api/admin/constitution', {
      method: 'PUT', headers, body: JSON.stringify({ markdown, description, version, note, lastUpdated: new Date().toLocaleDateString('en-CA') }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(r?.status === 401 ? 'Your admin sign-in has expired. Sign in again.' : d?.error ?? 'That did not publish. Try again.'); return; }
    setNote(''); setDone(true); setTimeout(() => setDone(false), 2600);
    onPublished(d);
  };

  return (
    <AnimatePresence>
      {(show || done) && (
        <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-3 shadow-[0_18px_50px_-15px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:bottom-5 sm:p-3.5">
          {done ? (
            <p className="flex items-center justify-center gap-2 py-1.5 text-[14px] font-semibold text-primary"><Check className="h-4 w-4" /> Published. The league sees it now.</p>
          ) : (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="hidden h-2 w-2 shrink-0 rounded-full bg-amber-500 sm:block" />
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="What changed? (optional, kept in the history)"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] outline-none focus:border-foreground/40" />
                <label className="flex shrink-0 items-center gap-1 text-[12.5px] text-muted-foreground">
                  v<input value={version} onChange={e => setVersion(e.target.value)} maxLength={20} aria-label="Version"
                    className="w-14 rounded-lg border border-border bg-background px-2 py-2 text-[13.5px] font-semibold text-foreground outline-none focus:border-foreground/40" />
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                {error && <span className="text-[12.5px] text-destructive">{error}</span>}
                <button onClick={onDiscard} className="rounded-full px-3.5 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">Discard</button>
                <button onClick={publish} disabled={busy || !version.trim()} className="rounded-full bg-foreground px-5 py-2 text-[13.5px] font-semibold text-background transition hover:bg-foreground/85 disabled:opacity-50">
                  {busy ? 'Publishing' : 'Publish'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HistoryDrawer({ open, onClose, history, onRestore }: { open: boolean; onClose: () => void; history: Revision[]; onRestore: (r: Revision) => void }) {
  const [peek, setPeek] = useState<number | null>(null);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
          <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 38 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="font-semibold">Version history</p>
                <p className="text-[12.5px] text-muted-foreground">Every published version. Restoring loads it into the editor to publish again.</p>
              </div>
              <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
            </div>
            <ol className="flex-1 space-y-2 overflow-y-auto p-4">
              {history.map((r, i) => (
                <motion.li key={r.savedAt + i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                  className="rounded-xl border border-border bg-card">
                  <button onClick={() => setPeek(p => (p === i ? null : i))} className="flex w-full items-start justify-between gap-3 p-3.5 text-left">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[14px] font-semibold">
                        Version {r.version}
                        {i === 0 && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-primary">Current</span>}
                      </span>
                      <span className="block text-[12.5px] text-muted-foreground">{new Date(r.savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      {r.note && <span className="mt-1 block text-[13px]">{r.note}</span>}
                    </span>
                    <motion.span animate={{ rotate: peek === i ? 180 : 0 }} className="mt-1 text-muted-foreground"><ChevronDown className="h-4 w-4" /></motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {peek === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-border px-3.5 pb-3.5 pt-3">
                          <p className="text-[12.5px] text-muted-foreground">
                            {parseConstitution(r.markdown).articles.map(a => a.title).filter(Boolean).join(', ') || 'No articles'}
                          </p>
                          {i > 0 && (
                            <button onClick={() => onRestore(r)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-[13px] font-semibold text-background">
                              <RotateCcw className="h-3.5 w-3.5" /> Restore this version
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              ))}
            </ol>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
