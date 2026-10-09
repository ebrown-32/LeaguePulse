'use client';

/**
 * Browser-side helpers for analytics: loading tables, colours, sharing,
 * saved reports and the starter templates.
 */

import { useEffect, useState } from 'react';
import type { DatasetId, QuerySpec } from './schema';
import type { Row } from './engine';

// ── Tables ───────────────────────────────────────────────────────────────────

const tableCache = new Map<DatasetId, Promise<Row[]>>();

export function loadTable(id: DatasetId): Promise<Row[]> {
  let p = tableCache.get(id);
  if (!p) {
    p = fetch(`/api/analytics/data?dataset=${id}`)
      .then(r => r.json())
      .then(d => { if (!Array.isArray(d?.rows)) throw new Error(d?.error ?? 'No data'); return d.rows as Row[]; });
    p.catch(() => tableCache.delete(id));
    tableCache.set(id, p);
  }
  return p;
}

export function useTable(id: DatasetId | null): { rows: Row[] | null; error: string | null } {
  const [state, setState] = useState<{ id: DatasetId | null; rows: Row[] | null; error: string | null }>(
    { id: null, rows: null, error: null });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setState(s => (s.id === id ? s : { id, rows: null, error: null }));
    loadTable(id)
      .then(rows => { if (!cancelled) setState({ id, rows, error: null }); })
      .catch(e => { if (!cancelled) setState({ id, rows: null, error: String(e?.message ?? e) }); });
    return () => { cancelled = true; };
  }, [id]);
  return state.id === id ? { rows: state.rows, error: state.error } : { rows: null, error: null };
}

// ── Colour ───────────────────────────────────────────────────────────────────

/**
 * Categorical series colours, in fixed order, with separate steps for dark.
 *
 * The validated reference palette from the dataviz method: this order passes
 * the colour-blind separation checks on adjacent pairs in both modes. The
 * order is the safety mechanism, so it is never shuffled or cycled; a ninth
 * series folds into "Other" instead of getting a generated hue.
 */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const SERIES_DARK  = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const MAX_SERIES = 8;

export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains('dark'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface Widget {
  id: string;
  spec: QuerySpec;
  /** Half or full width on a wide screen. */
  wide?: boolean;
}

export interface Report {
  id: string;
  name: string;
  widgets: Widget[];
  updatedAt: string;
}

const STORE_KEY = 'lp_analytics_reports_v1';
export const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Saved reports live in this browser.
 *
 * There is no sign-in, so there is no "your" on the server to save to, and
 * writing visitors' reports into the league's shared store would let anyone
 * fill it. A report travels by link instead: the whole thing is in the URL.
 */
export function readReports(): Report[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function writeReports(list: Report[]) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

// ── Sharing ──────────────────────────────────────────────────────────────────

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export const encodeShare = (v: unknown) => toB64Url(JSON.stringify(v));
export function decodeShare<T>(s: string): T | null {
  try { return JSON.parse(fromB64Url(s)) as T; } catch { return null; }
}

// ── Templates ────────────────────────────────────────────────────────────────

const w = (spec: QuerySpec, wide = false): Widget => ({ id: newId(), spec, wide });

/** Starter reports, so the first screen is something worth looking at. */
export function templates(currentSeason: string): { id: string; name: string; blurb: string; build: () => Report }[] {
  const now = () => new Date().toISOString();
  const thisSeason = { field: 'season', op: 'eq' as const, value: currentSeason };
  const regular = { field: 'phase', op: 'eq' as const, value: 'Regular season' };
  return [
    {
      id: 'pulse', name: 'League Pulse', blurb: 'This season at a glance: scoring, form and who is wasting points',
      build: () => ({
        id: newId(), name: 'League Pulse', updatedAt: now(), widgets: [
          w({ dataset: 'matchups', title: 'Points by week', dimensions: ['week', 'manager'], measures: [{ field: 'points', agg: 'sum' }], filters: [thisSeason], chart: 'line' }, true),
          w({ dataset: 'matchups', title: 'Highest score this season', dimensions: [], measures: [{ field: 'points', agg: 'max' }], filters: [thisSeason], chart: 'kpi' }),
          w({ dataset: 'matchups', title: 'Average score this season', dimensions: [], measures: [{ field: 'points', agg: 'avg' }], filters: [thisSeason], chart: 'kpi' }),
          w({ dataset: 'players', title: 'Points left on the bench', dimensions: ['manager'], measures: [{ field: 'bench_points', agg: 'sum' }], filters: [thisSeason], chart: 'hbar' }),
          w({ dataset: 'matchups', title: 'Weeks beating the median', dimensions: ['manager'], measures: [{ field: 'beat_median', agg: 'count' }], filters: [thisSeason, { field: 'beat_median', op: 'is', value: true }], chart: 'hbar' }),
        ],
      }),
    },
    {
      id: 'legacy', name: 'All-Time Legacy', blurb: 'Titles, win rates and scoring across every season',
      build: () => ({
        id: newId(), name: 'All-Time Legacy', updatedAt: now(), widgets: [
          w({ dataset: 'seasons', title: 'Career win rate', dimensions: ['manager'], measures: [{ field: 'win_pct', agg: 'avg' }], filters: [], chart: 'hbar' }),
          w({ dataset: 'seasons', title: 'Points per game by season', dimensions: ['season', 'manager'], measures: [{ field: 'ppg', agg: 'avg' }], filters: [], chart: 'line' }),
          w({ dataset: 'seasons', title: 'Points for vs wins', dimensions: ['manager'], measures: [{ field: 'points_for', agg: 'sum' }, { field: 'wins', agg: 'sum' }], filters: [], chart: 'scatter' }, true),
          w({ dataset: 'matchups', title: 'Playoff win rate', dimensions: ['manager'], measures: [{ field: 'win', agg: 'avg' }], filters: [{ field: 'phase', op: 'eq', value: 'Playoffs' }], chart: 'hbar' }),
          w({ dataset: 'matchups', title: 'Top scores of the week', dimensions: ['manager'], measures: [{ field: 'top_score', agg: 'count' }], filters: [{ field: 'top_score', op: 'is', value: true }], chart: 'donut' }),
        ],
      }),
    },
    {
      id: 'draft', name: 'Draft Room', blurb: 'Which picks paid off, and how each round produced',
      build: () => ({
        id: newId(), name: 'Draft Room', updatedAt: now(), widgets: [
          w({ dataset: 'drafts', title: 'Best picks ever', dimensions: ['player'], measures: [{ field: 'season_points', agg: 'sum' }], filters: [], sort: { by: 'sum(season_points)', dir: 'desc' }, limit: 10, chart: 'hbar' }, true),
          w({ dataset: 'drafts', title: 'Points by round', dimensions: ['round'], measures: [{ field: 'season_points', agg: 'avg' }], filters: [], chart: 'bar' }),
          w({ dataset: 'drafts', title: 'Positions taken by round', dimensions: ['round', 'position'], measures: [{ field: 'picks', agg: 'sum' }], filters: [], chart: 'bar' }),
          w({ dataset: 'drafts', title: 'Draft points by manager', dimensions: ['manager'], measures: [{ field: 'season_points', agg: 'sum' }], filters: [], chart: 'hbar' }),
        ],
      }),
    },
    {
      id: 'wire', name: 'The Wire', blurb: 'Trades, waivers and the managers who never stop dealing',
      build: () => ({
        id: newId(), name: 'The Wire', updatedAt: now(), widgets: [
          w({ dataset: 'transactions', title: 'Moves by month', dimensions: ['month', 'type'], measures: [{ field: 'moves', agg: 'sum' }], filters: [], chart: 'area' }, true),
          w({ dataset: 'transactions', title: 'Trades by manager', dimensions: ['manager'], measures: [{ field: 'moves', agg: 'sum' }], filters: [{ field: 'type', op: 'eq', value: 'Trade' }], chart: 'hbar' }),
          w({ dataset: 'transactions', title: 'Pickups by manager', dimensions: ['manager'], measures: [{ field: 'adds', agg: 'sum' }], filters: [{ field: 'type', op: 'in', value: ['Waiver', 'Free agent'] }], chart: 'hbar' }),
          w({ dataset: 'transactions', title: 'Draft picks traded', dimensions: [], measures: [{ field: 'picks_moved', agg: 'sum' }], filters: [], chart: 'kpi' }),
        ],
      }),
    },
    {
      id: 'luck', name: 'Luck Index', blurb: 'Points against, close losses and who the schedule loves',
      build: () => ({
        id: newId(), name: 'Luck Index', updatedAt: now(), widgets: [
          w({ dataset: 'seasons', title: 'Points against, all time', dimensions: ['manager'], measures: [{ field: 'points_against', agg: 'sum' }], filters: [], chart: 'hbar' }),
          w({ dataset: 'matchups', title: 'Losses by under 10 points', dimensions: ['manager'], measures: [{ field: '*', agg: 'count' }], filters: [{ field: 'result', op: 'eq', value: 'Loss' }, { field: 'margin', op: 'gt', value: -10 }, regular], chart: 'hbar' }),
          w({ dataset: 'matchups', title: 'Average margin', dimensions: ['manager'], measures: [{ field: 'margin', agg: 'avg' }], filters: [regular], chart: 'hbar' }, true),
        ],
      }),
    },
  ];
}
