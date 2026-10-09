'use client';

/**
 * Self-serve analytics.
 *
 * Three ways in, for three kinds of person: ask in plain words and get a
 * report; drag fields onto shelves and watch the chart build; or open the
 * spreadsheet and dig through rows. They all produce the same thing, a query
 * spec, so a report can start as a question, be refined by hand, and be saved
 * to a dashboard, without any of the three being a dead end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PageLayout } from '@/components/layout/PageLayout';
import { cn } from '@/lib/utils';
import { IconChip } from '@/components/ui/kit';
import HoneycombLoader from '@/components/ui/honeycomb-loader';
import {
  Sparkles, Swords, Trophy, Users, ArrowLeftRight, ClipboardList, BarChart3,
  Share2, Plus, Check, ArrowRight, LayoutDashboard, Upload, X, type Icon,
} from '@/components/icons';
import {
  DATASETS, datasetById, emptySpec, type ChartType, type DatasetId, type QuerySpec,
} from '@/lib/analytics/schema';
import { runQuery, type Cell } from '@/lib/analytics/engine';
import {
  useTable, readReports, writeReports, encodeShare, decodeShare, newId, type Report, type Widget,
} from '@/lib/analytics/client';
import Builder, { FieldPanel } from '@/components/analytics/Builder';
import ChartView, { resolveChart } from '@/components/analytics/ChartView';
import DataGrid, { toCsv } from '@/components/analytics/DataGrid';
import ReportBoard from '@/components/analytics/ReportBoard';

const DATASET_ICON: Record<DatasetId, Icon> = {
  matchups: Swords, seasons: Trophy, players: Users, transactions: ArrowLeftRight, drafts: ClipboardList,
};

const CHARTS: { id: ChartType; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'bar', label: 'Bar' }, { id: 'hbar', label: 'Ranking' },
  { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' }, { id: 'donut', label: 'Donut' },
  { id: 'scatter', label: 'Scatter' }, { id: 'kpi', label: 'Number' }, { id: 'table', label: 'Table' },
];

const SUGGESTIONS = [
  'Who leaves the most points on the bench?',
  'Points per week for every team this season',
  'Best draft picks ever',
  'Who makes the most trades?',
  'Playoff win rate by manager',
  'Highest score ever',
];

export default function AnalyticsView() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'explore' | 'reports'>('explore');
  const [spec, setSpec] = useState<QuerySpec>(() => ({
    // No title: the placeholder names the chart from its fields, and keeps up
    // as fields change. A fixed title went stale the moment one was dragged.
    ...emptySpec('matchups'), dimensions: ['manager'], measures: [{ field: 'points', agg: 'avg' }],
  }));
  const [view, setView] = useState<'result' | 'raw'>('result');
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<Report | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [currentSeason, setCurrentSeason] = useState('');
  /** The report tile being edited in Explore, so "Update" can put it back. */
  const [editing, setEditing] = useState<{ reportId: string; widgetId: string } | null>(null);

  const { rows, error } = useTable(spec.dataset);
  const result = useMemo(() => (rows ? runQuery(rows, spec) : null), [rows, spec]);
  const raw = useMemo(
    () => (rows ? runQuery(rows, { ...spec, dimensions: [], measures: [], sort: undefined, limit: undefined }) : null),
    [rows, spec],
  );

  // Saved reports, a shared report or chart from the URL, and the season.
  useEffect(() => {
    const list = readReports();
    setReports(list);
    setActiveReport(list[0]?.id ?? null);
    const r = params.get('report');
    if (r) {
      const rep = decodeShare<Report>(r);
      if (rep?.widgets) { setIncoming(rep); setTab('reports'); }
    }
    const q = params.get('q');
    if (q) {
      const s = decodeShare<QuerySpec>(q);
      if (s && datasetById(s.dataset)) setSpec(s);
    }
    fetch('/api/analytics/data?dataset=seasons').then(x => x.json())
      .then(d => setCurrentSeason(String(d?.seasons?.[d.seasons.length - 1] ?? ''))).catch(() => {});
    // Read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveReports = useCallback((next: Report[]) => { setReports(next); writeReports(next); }, []);
  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const change = (next: QuerySpec) => { setSpec(next); setAiNote(null); };

  const switchDataset = (id: DatasetId) => {
    if (id === spec.dataset) return;
    setEditing(null);
    change({ ...emptySpec(id), title: '' });
  };

  const addFilterValue = (field: string, value: Cell, exclude: boolean) => {
    const v = value == null ? '' : (value as string | number);
    change({ ...spec, filters: [...spec.filters, exclude ? { field, op: 'neq', value: String(v) } : { field, op: 'in', value: [v] }] });
  };

  // ── Ask ──────────────────────────────────────────────────────────────────
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setQuestion(text);
    setAsking(true); setAskError(null);
    try {
      const res = await fetch('/api/analytics/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }),
      });
      const d = await res.json();
      if (!res.ok || !d.spec) throw new Error(d.error ?? 'Could not build that');
      setEditing(null);
      setSpec(d.spec);
      setAiNote(text);
      setTab('explore');
    } catch (e: any) {
      setAskError(e.message ?? 'Could not build that');
    } finally {
      setAsking(false);
    }
  };

  // ── Reports ──────────────────────────────────────────────────────────────
  const addToReport = (reportId: string | 'new') => {
    const widget: Widget = { id: newId(), spec: { ...spec, title: spec.title || autoTitle(spec) } };
    let next: Report[];
    let id = reportId;
    if (reportId === 'new') {
      const r: Report = { id: newId(), name: 'My report', widgets: [widget], updatedAt: new Date().toISOString() };
      next = [...reports, r]; id = r.id;
    } else {
      next = reports.map(r => r.id === reportId ? { ...r, widgets: [...r.widgets, widget], updatedAt: new Date().toISOString() } : r);
    }
    saveReports(next);
    setActiveReport(id);
    flash(`Added to ${next.find(r => r.id === id)?.name}`);
  };

  const updateTile = () => {
    if (!editing) return;
    saveReports(reports.map(r => r.id !== editing.reportId ? r : {
      ...r, updatedAt: new Date().toISOString(),
      widgets: r.widgets.map(w => w.id === editing.widgetId ? { ...w, spec } : w),
    }));
    setActiveReport(editing.reportId);
    setEditing(null);
    setTab('reports');
  };

  const shareUrl = (key: 'q' | 'report', value: unknown) => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(key, encodeShare(value));
    return url.toString();
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } };

  const download = () => {
    if (!result) return;
    const blob = new Blob([toCsv(result.columns, result.rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(spec.title || autoTitle(spec)).replace(/[^\w]+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chartKind = result ? resolveChart(spec, result) : 'table';

  return (
    <PageLayout
      title={<>Analytics<span className="ml-2.5 inline-flex shrink-0 items-center rounded-[3px] border border-primary/40 bg-primary/10 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase leading-none tracking-wider text-primary">Beta</span></>}
      subtitle="Every game, pick and move in league history. Ask a question, drag fields, or dig through the rows."
    >
      {/* ── Ask ───────────────────────────────────────────────────────────── */}
      <section className="lp-spotlight overflow-visible rounded-2xl bg-card shadow-[var(--elev-2)]">
        <div className="relative z-[2] p-4 sm:p-5">
          <form onSubmit={e => { e.preventDefault(); ask(question); }} className="flex items-center gap-3">
            <IconChip icon={Sparkles} size="lg" className="hidden sm:inline-flex" />
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Ask anything: who scores the most in the playoffs?"
              className="min-w-0 flex-1 bg-transparent font-display text-[17px] font-semibold text-foreground outline-none placeholder:font-sans placeholder:font-normal placeholder:text-muted-foreground sm:text-[19px]"
            />
            <button type="submit" disabled={asking || !question.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-[var(--elev-1)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-50">
              {asking ? 'Building' : 'Build it'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => ask(s)} disabled={asking}
                className="shrink-0 rounded-full border border-border bg-background/60 px-3 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
          {askError && <p className="mt-2 text-[12.5px] text-red-500">{askError}</p>}
        </div>
      </section>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:w-fit">
        {([['explore', 'Explore', BarChart3], ['reports', `Reports${reports.length ? ` (${reports.length})` : ''}`, LayoutDashboard]] as const).map(([id, label, I]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors sm:flex-none',
              tab === id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {tab === id && <motion.span layoutId="ana-tab" className="absolute inset-0 rounded-lg bg-card shadow-[var(--elev-1)]" transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }} />}
            <I className="relative h-4 w-4" /><span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {incoming && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4">
          <IconChip icon={Upload} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Someone shared a report: {incoming.name}</p>
            <p className="text-[12.5px] text-muted-foreground">{incoming.widgets.length} charts, built on today&apos;s data.</p>
          </div>
          <button onClick={() => {
            const copyR = { ...incoming, id: newId(), widgets: incoming.widgets.map(w => ({ ...w, id: newId() })) };
            saveReports([...reports, copyR]); setActiveReport(copyR.id); setIncoming(null); flash('Saved to your reports');
          }} className="rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground">Save a copy</button>
          <button onClick={() => setIncoming(null)} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      {tab === 'reports' ? (
        <ReportBoard
          reports={incoming ? [...reports, incoming] : reports}
          activeId={incoming && !activeReport ? incoming.id : activeReport}
          currentSeason={currentSeason}
          onChange={saveReports}
          onSelect={setActiveReport}
          onEdit={(w, reportId) => { setSpec(w.spec); setEditing({ reportId, widgetId: w.id }); setAiNote(null); setTab('explore'); }}
          onShare={async r => copy(shareUrl('report', { ...r, id: 'shared' }))}
        />
      ) : (
        <ExploreLayout
          spec={spec} onDataset={switchDataset} onChange={change}
          tableRows={rows ?? []}
        >
          {/* Canvas */}
          <section className="lp-surface rounded-2xl p-4 sm:p-5">
            <AnimatePresence>
              {aiNote && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mb-3 flex items-center gap-1.5 overflow-hidden text-[12px] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Built from &ldquo;{aiNote}&rdquo;. Check the fields above, and change any of them.
                </motion.p>
              )}
            </AnimatePresence>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={spec.title ?? ''}
                onChange={e => setSpec({ ...spec, title: e.target.value })}
                placeholder={autoTitle(spec)}
                className="w-full min-w-0 bg-transparent font-display text-xl font-bold tracking-[-0.02em] text-foreground outline-none placeholder:text-foreground/80 sm:w-auto sm:flex-1"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {editing ? (
                  <button onClick={updateTile}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground">
                    <Check className="h-3.5 w-3.5" /> Update report
                  </button>
                ) : (
                  <AddToReport reports={reports} onPick={addToReport} />
                )}
                <button onClick={async () => { await copy(shareUrl('q', spec)); flash('Link to this chart copied'); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
                <button onClick={download} disabled={!result}
                  className="hidden rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted sm:inline-flex">
                  CSV
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
              {CHARTS.map(c => (
                <button key={c.id} onClick={() => setSpec({ ...spec, chart: c.id })}
                  className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
                    spec.chart === c.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  {c.label}{c.id === 'auto' && spec.chart === 'auto' && result ? ` · ${CHARTS.find(x => x.id === chartKind)?.label}` : ''}
                </button>
              ))}
              <span className="mx-1 w-px shrink-0 bg-border" />
              <select value={spec.limit ?? 0} onChange={e => setSpec({ ...spec, limit: Number(e.target.value) || undefined })}
                className="shrink-0 rounded-lg bg-transparent px-2 py-1 text-[12px] font-semibold text-muted-foreground outline-none hover:bg-muted">
                <option value={0}>All rows</option><option value={5}>Top 5</option><option value={10}>Top 10</option><option value={25}>Top 25</option>
              </select>
            </div>

            <div className="mt-5 min-h-[200px]">
              {error ? <p className="py-16 text-center text-[13px] text-muted-foreground">Could not load this data. {error}</p>
                : !result ? (
                  <div className="flex h-[300px] items-center justify-center">
                    <HoneycombLoader label="Loading the data" style={{ ['--honeycomb-size' as string]: '12px' }} />
                  </div>
                ) : chartKind === 'table'
                  ? <DataGrid columns={result.columns} rows={result.rows} height={360} onFilterValue={addFilterValue} />
                  : <ChartView spec={spec} result={result} height={320} />}
            </div>
          </section>

          {/* Spreadsheet */}
          {result && raw && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                  {([['result', 'Result'], ['raw', 'Raw data']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setView(id)}
                      className={cn('whitespace-nowrap rounded-md px-3 py-1 text-[12px] font-semibold',
                        view === id ? 'bg-card text-foreground shadow-[var(--elev-1)]' : 'text-muted-foreground')}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  {result.matched.toLocaleString()} of {(rows?.length ?? 0).toLocaleString()} rows match<span className="hidden sm:inline">. Right-click a value to filter</span>.
                </p>
              </div>
              <DataGrid
                columns={view === 'result' ? result.columns : raw.columns}
                rows={view === 'result' ? result.rows : raw.rows}
                height={view === 'result' ? Math.min(420, 54 + Math.max(4, result.rows.length) * 30 + 2) : 460}
                onFilterValue={addFilterValue}
              />
            </section>
          )}
        </ExploreLayout>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 z-[95] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background shadow-[var(--elev-3)]"
            style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
}

/** A title from the spec, for when the user has not written one. */
function autoTitle(spec: QuerySpec): string {
  const ds = datasetById(spec.dataset)!;
  const m = spec.measures[0];
  const mf = m ? ds.fields.find(f => f.key === m.field) : null;
  const what = m ? (m.field === '*' ? 'Rows' : `${m.agg === 'avg' ? 'Average ' : m.agg === 'max' ? 'Highest ' : m.agg === 'min' ? 'Lowest ' : ''}${(mf?.label ?? m.field).toLowerCase()}`) : ds.label;
  const by = spec.dimensions.map(d => ds.fields.find(f => f.key === d)?.label.toLowerCase()).filter(Boolean).join(' and ');
  const t = by ? `${what} by ${by}` : what;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function AddToReport({ reports, onPick }: { reports: Report[]; onPick: (id: string | 'new') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => (reports.length ? setOpen(o => !o) : onPick('new'))}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground shadow-[var(--elev-1)] hover:brightness-110">
        <Plus className="h-3.5 w-3.5" /> Add to report
      </button>
      {open && (
        <div className="lp-glass absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border p-1 shadow-[var(--elev-3)]">
          {reports.map(r => (
            <button key={r.id} onClick={() => { onPick(r.id); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-foreground hover:bg-primary/10">
              <span className="truncate">{r.name}</span>
              <span className="text-[11px] text-muted-foreground">{r.widgets.length}</span>
            </button>
          ))}
          <button onClick={() => { onPick('new'); setOpen(false); }}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-primary hover:bg-primary/10">
            <Plus className="h-3.5 w-3.5" /> New report
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Explore: datasets and fields down the side, shelves and canvas in the main
 * column. The builder's drag context has to span the field list and the
 * shelves, so the builder renders both and this decides where they go.
 */
function ExploreLayout({ spec, onDataset, onChange, tableRows, children }: {
  spec: QuerySpec;
  onDataset: (id: DatasetId) => void; onChange: (s: QuerySpec) => void;
  tableRows: any[]; children: React.ReactNode;
}) {
  const ds = datasetById(spec.dataset)!;
  const [fieldsOpen, setFieldsOpen] = useState(false);
  return (
    <Builder spec={spec} rows={tableRows} onChange={onChange}>
      {({ add, shelves }) => (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="lp-surface rounded-2xl p-2">
              <p className="px-2 pb-1.5 pt-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Data</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-5 lg:grid-cols-1">
                {DATASETS.map(d => {
                  const I = DATASET_ICON[d.id];
                  const on = d.id === spec.dataset;
                  return (
                    <button key={d.id} onClick={() => onDataset(d.id)} title={d.blurb}
                      className={cn('flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
                        on ? 'bg-primary/10' : 'hover:bg-muted/60')}>
                      <IconChip icon={I} size="sm" tone={on ? 'primary' : 'muted'} />
                      <span className="min-w-0">
                        <span className={cn('block truncate text-[13px] font-semibold', on ? 'text-primary' : 'text-foreground')}>{d.label}</span>
                        <span className="hidden truncate text-[10.5px] text-muted-foreground lg:block">{d.grain}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* On a phone the field list is behind a button; tapping a field adds it. */}
            <button onClick={() => setFieldsOpen(o => !o)}
              className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-[13px] font-semibold text-foreground lg:hidden">
              <span className="inline-flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Add a field</span>
              <span className="text-[11px] text-muted-foreground">{ds.fields.length} fields</span>
            </button>
            <div className={cn('lp-surface rounded-2xl p-3 lg:block', fieldsOpen ? 'block' : 'hidden')}>
              <FieldPanel dataset={ds} onAdd={f => { add(f); setFieldsOpen(false); }} />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <section className="lp-surface rounded-2xl p-4">{shelves}</section>
            {children}
          </div>
        </div>
      )}
    </Builder>
  );
}
