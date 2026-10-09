/**
 * The query engine: filter, group, aggregate, sort.
 *
 * Runs in the browser over rows already fetched, which is why dragging a field
 * onto a shelf redraws instantly rather than waiting on a server. The largest
 * table is about seven thousand rows; a full pass is a millisecond or two.
 *
 * Pure, so it is the one piece that can be tested without a page.
 */

import {
  datasetById, fieldOf, measureKey, measureLabel,
  type Dataset, type Filter, type Measure, type QuerySpec,
} from './schema';

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

export interface ResultColumn {
  key: string;
  label: string;
  kind: 'dimension' | 'measure';
  format?: string;
}

export interface Result {
  columns: ResultColumn[];
  rows: Row[];
  /** Rows that survived the filters, before grouping. */
  matched: number;
}

/** How a missing value is shown and grouped. */
export const NONE = '(none)';

function passes(row: Row, f: Filter): boolean {
  const v = row[f.field];
  const val = f.value;
  switch (f.op) {
    case 'eq':  return String(v) === String(val);
    case 'neq': return String(v) !== String(val);
    case 'in':  return Array.isArray(val) && val.map(String).includes(String(v));
    case 'is':  return Boolean(v) === (val === true || val === 'true');
    case 'contains': return String(v ?? '').toLowerCase().includes(String(val).toLowerCase());
    case 'gt':  return Number(v) >  Number(val);
    case 'gte': return Number(v) >= Number(val);
    case 'lt':  return Number(v) <  Number(val);
    case 'lte': return Number(v) <= Number(val);
    default: return true;
  }
}

export function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return filters.length ? rows.filter(r => filters.every(f => passes(r, f))) : rows;
}

function aggregate(values: Cell[], m: Measure): number | null {
  if (m.agg === 'count') return m.field === '*' ? values.length : values.filter(v => v != null).length;
  if (m.agg === 'distinct') return new Set(values.filter(v => v != null).map(String)).size;
  const nums = values.filter(v => v != null && v !== '' && !Number.isNaN(Number(v))).map(Number);
  if (!nums.length) return null;
  switch (m.agg) {
    case 'sum': return round(nums.reduce((a, b) => a + b, 0));
    case 'avg': return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    case 'median': {
      const s = [...nums].sort((a, b) => a - b), mid = s.length / 2;
      return round(s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2);
    }
  }
  return null;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Natural order for a dimension value: numbers as numbers, the rest as text. */
export function compareValues(a: Cell, b: Cell): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '') return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Run a spec over a table.
 *
 * With no dimensions and no measures it returns the filtered rows untouched,
 * which is the raw data view. With measures and no dimensions it returns one
 * row, which is a headline number.
 */
export function runQuery(rows: Row[], spec: QuerySpec): Result {
  const ds = datasetById(spec.dataset)!;
  const filtered = applyFilters(rows, spec.filters);

  if (!spec.dimensions.length && !spec.measures.length) {
    return {
      columns: ds.fields.map(f => ({ key: f.key, label: f.label, kind: f.role, format: f.format })),
      rows: sortRows(filtered, spec, ds),
      matched: filtered.length,
    };
  }

  const dims = spec.dimensions.filter(d => fieldOf(ds, d));
  const measures = spec.measures.length ? spec.measures : [{ field: '*', agg: 'count' as const }];

  const groups = new Map<string, { key: Row; rows: Row[] }>();
  for (const r of filtered) {
    const k = dims.map(d => String(r[d] ?? NONE)).join('\u0001');
    let g = groups.get(k);
    if (!g) {
      g = { key: Object.fromEntries(dims.map(d => [d, r[d] ?? NONE])), rows: [] };
      groups.set(k, g);
    }
    g.rows.push(r);
  }

  const out: Row[] = [...groups.values()].map(g => {
    const row: Row = { ...g.key };
    for (const m of measures) row[measureKey(m)] = aggregate(g.rows.map(r => (m.field === '*' ? 1 : r[m.field])), m);
    return row;
  });

  const columns: ResultColumn[] = [
    ...dims.map(d => {
      const f = fieldOf(ds, d)!;
      return { key: d, label: f.label, kind: 'dimension' as const, format: f.format };
    }),
    ...measures.map(m => ({
      key: measureKey(m),
      label: measureLabel(ds, m),
      kind: 'measure' as const,
      format: m.agg === 'count' || m.agg === 'distinct' ? 'int' : fieldOf(ds, m.field)?.format,
    })),
  ];

  return { columns, rows: sortRows(out, spec, ds, columns), matched: filtered.length };
}

function sortRows(rows: Row[], spec: QuerySpec, ds: Dataset, columns?: ResultColumn[]): Row[] {
  let by = spec.sort?.by;
  let dir = spec.sort?.dir ?? 'desc';
  if (!by && columns) {
    // A sensible default: time in time order, everything else by the first
    // measure, biggest first, which is the order people read a ranking in.
    const first = spec.dimensions[0] ? fieldOf(ds, spec.dimensions[0]) : null;
    if (first?.ordinal) { by = first.key; dir = 'asc'; }
    else by = columns.find(c => c.kind === 'measure')?.key;
  }
  const sorted = by ? [...rows].sort((a, b) => compareValues(a[by!], b[by!]) * (dir === 'asc' ? 1 : -1)) : rows;
  return spec.limit ? sorted.slice(0, spec.limit) : sorted;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatCell(v: Cell, format?: string): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (format === 'pct') return `${(v * 100).toFixed(1)}%`;
    if (format === 'int') return Math.round(v).toLocaleString();
    if (format === 'money') return `$${v.toLocaleString()}`;
    return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

/** The values a dimension takes, for filter pickers. Most common first, unless ordinal. */
export function distinctValues(rows: Row[], field: string, ordinal = false): Cell[] {
  const counts = new Map<string, { v: Cell; n: number }>();
  for (const r of rows) {
    const v = r[field] ?? null;
    const k = String(v);
    const hit = counts.get(k);
    if (hit) hit.n++; else counts.set(k, { v, n: 1 });
  }
  const list = [...counts.values()];
  return (ordinal
    ? list.sort((a, b) => compareValues(a.v, b.v))
    : list.sort((a, b) => b.n - a.n)
  ).map(x => x.v);
}

/** Pick a chart for a result when the user has not. */
export function autoChart(spec: QuerySpec, result: Result): Exclude<QuerySpec['chart'], 'auto'> {
  const ds = datasetById(spec.dataset)!;
  const dims = spec.dimensions;
  const measures = result.columns.filter(c => c.kind === 'measure');
  if (!dims.length && !spec.measures.length) return 'table';
  if (!dims.length) return 'kpi';
  const first = fieldOf(ds, dims[0]);
  if (first?.ordinal && result.rows.length > 2) return 'line';
  if (measures.length >= 2 && dims.length === 1 && result.rows.length > 4) return 'scatter';
  // Two dimensions: the second is a series, which a ranking cannot show.
  if (dims.length === 2) return 'bar';
  // Long category names read better down the side than slanted along the bottom.
  const longest = Math.max(0, ...result.rows.map(r => String(r[dims[0]] ?? '').length));
  return result.rows.length > 8 || longest > 12 ? 'hbar' : 'bar';
}
