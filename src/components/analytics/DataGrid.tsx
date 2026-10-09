'use client';

/**
 * A spreadsheet view of a table.
 *
 * Behaves the way people expect a spreadsheet to, because that expectation is
 * the whole point of the "excel-like" ask: lettered columns and numbered rows,
 * click and drag to select a range, shift-click and shift-arrow to extend it,
 * arrow keys to move, Cmd/Ctrl+C to copy as tab separated values that paste
 * cleanly into Excel or Sheets, a name box and formula bar for the active
 * cell, click a header to sort, drag a header edge to resize, and a status bar
 * that sums, averages and counts whatever is selected.
 *
 * Rows are virtualised: the player table is seven thousand rows, and only the
 * thirty or so on screen are in the DOM.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { compareValues, formatCell, type Cell, type ResultColumn, type Row } from '@/lib/analytics/engine';
import { ArrowDown, ArrowUp, Copy, Filter, X } from '@/components/icons';

const ROW_H = 30;
const HEAD_H = 54;
const ROWNUM_W = 48;
const OVERSCAN = 8;

interface Pos { r: number; c: number }

function colLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function defaultWidth(col: ResultColumn, rows: Row[]): number {
  const sample = rows.slice(0, 200).map(r => formatCell(r[col.key], col.format).length);
  const longest = Math.max(col.label.length, ...sample);
  return Math.max(84, Math.min(280, longest * 7.4 + 28));
}

export default function DataGrid({ columns, rows, height = 420, onFilterValue, className }: {
  columns: ResultColumn[];
  rows: Row[];
  height?: number;
  /** Right-click a value to filter the report to it, or to exclude it. */
  onFilterValue?: (field: string, value: Cell, exclude: boolean) => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [anchor, setAnchor] = useState<Pos | null>(null);
  const [focus, setFocus] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; pos: Pos } | null>(null);
  const [copied, setCopied] = useState(false);

  // New data, new selection: a selection over a different table means nothing.
  useEffect(() => { setAnchor(null); setFocus(null); setSort(null); }, [columns]);

  const view = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => compareValues(a[sort.key], b[sort.key]) * (sort.dir === 'asc' ? 1 : -1));
  }, [rows, sort]);

  const widthOf = useCallback((c: ResultColumn) => widths[c.key] ?? defaultWidth(c, rows), [widths, rows]);
  const lefts = useMemo(() => {
    const out: number[] = [];
    let x = ROWNUM_W;
    for (const c of columns) { out.push(x); x += widthOf(c); }
    return { out, total: x };
  }, [columns, widthOf]);

  const bodyH = height - HEAD_H;
  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(view.length, Math.ceil((scrollTop + bodyH) / ROW_H) + OVERSCAN);

  const sel = useMemo(() => {
    if (!anchor || !focus) return null;
    return {
      r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r),
      c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);
  const inSel = (r: number, c: number) => !!sel && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;

  /** Excel's status bar: aggregates over the numeric cells in the selection. */
  const stats = useMemo(() => {
    if (!sel) return null;
    let count = 0, n = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let r = sel.r0; r <= Math.min(sel.r1, view.length - 1); r++) {
      for (let c = sel.c0; c <= sel.c1; c++) {
        const v = view[r]?.[columns[c]?.key];
        if (v == null || v === '') continue;
        count++;
        if (typeof v === 'number') { n++; sum += v; min = Math.min(min, v); max = Math.max(max, v); }
      }
    }
    return { count, n, sum, min, max, avg: n ? sum / n : 0 };
  }, [sel, view, columns]);

  const ensureVisible = (p: Pos) => {
    const el = scroller.current;
    if (!el) return;
    const top = p.r * ROW_H, bottom = top + ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + bodyH) el.scrollTop = bottom - bodyH;
    const left = lefts.out[p.c] - ROWNUM_W, right = lefts.out[p.c] + widthOf(columns[p.c]);
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  };

  const copy = useCallback(async () => {
    if (!sel) return;
    const lines: string[] = [];
    // A whole-column selection carries its header, so it pastes as a table.
    if (sel.r0 === 0 && sel.r1 >= view.length - 1) {
      lines.push(columns.slice(sel.c0, sel.c1 + 1).map(c => c.label).join('\t'));
    }
    for (let r = sel.r0; r <= sel.r1 && r < view.length; r++) {
      lines.push(columns.slice(sel.c0, sel.c1 + 1).map(c => {
        const v = view[r][c.key];
        return v == null ? '' : typeof v === 'number' ? String(v) : formatCell(v, c.format);
      }).join('\t'));
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked; nothing to do */ }
  }, [sel, view, columns]);

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copy(); return; }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 }); setFocus({ r: view.length - 1, c: columns.length - 1 });
      return;
    }
    if (e.key === 'Escape') { setMenu(null); return; }
    if (!focus) return;
    const step: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1], PageDown: [Math.floor(bodyH / ROW_H), 0], PageUp: [-Math.floor(bodyH / ROW_H), 0],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const jump = mod && e.key.startsWith('Arrow');
    const next: Pos = {
      r: jump ? (d[0] > 0 ? view.length - 1 : d[0] < 0 ? 0 : focus.r) : Math.max(0, Math.min(view.length - 1, focus.r + d[0])),
      c: jump ? (d[1] > 0 ? columns.length - 1 : d[1] < 0 ? 0 : focus.c) : Math.max(0, Math.min(columns.length - 1, focus.c + d[1])),
    };
    if (!(e.shiftKey && e.key.startsWith('Arrow'))) setAnchor(next);
    setFocus(next);
    ensureVisible(next);
  };

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragging]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const startResize = (e: React.PointerEvent, col: ResultColumn) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, start = widthOf(col);
    const move = (ev: PointerEvent) => setWidths(w => ({ ...w, [col.key]: Math.max(56, start + ev.clientX - startX) }));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const active = focus && columns[focus.c] ? { col: columns[focus.c], v: view[focus.r]?.[columns[focus.c].key] } : null;

  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border border-border bg-card', className)}>
      {/* Name box and formula bar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-2 py-1.5 text-[12px]">
        <span className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-center font-mono text-[11px] text-foreground">
          {focus ? `${colLetter(focus.c)}${focus.r + 1}` : '--'}
        </span>
        <span className="font-serif text-[13px] italic text-muted-foreground">fx</span>
        <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-0.5 text-foreground">
          {active ? (active.v == null ? '' : typeof active.v === 'number' ? String(active.v) : formatCell(active.v, active.col.format)) : ''}
        </span>
        <button onClick={copy} disabled={!sel}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
          <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div
        ref={scroller}
        tabIndex={0}
        role="grid"
        aria-rowcount={view.length}
        aria-colcount={columns.length}
        data-focus-custom
        onKeyDown={onKey}
        onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        className="relative overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        style={{ height }}
      >
        <div style={{ width: lefts.total, height: HEAD_H + view.length * ROW_H, position: 'relative' }}>
          {/* Header: letters over names, both sticky */}
          <div className="sticky top-0 z-20 flex" style={{ height: HEAD_H, width: lefts.total }}>
            <div className="sticky left-0 z-30 border-b border-r border-border bg-muted"
                 style={{ width: ROWNUM_W, height: HEAD_H }}
                 onClick={() => { setAnchor({ r: 0, c: 0 }); setFocus({ r: view.length - 1, c: columns.length - 1 }); }} />
            {columns.map((c, ci) => {
              const sorted = sort?.key === c.key;
              const colSel = sel && ci >= sel.c0 && ci <= sel.c1;
              return (
                <div key={c.key} className="relative shrink-0 border-b border-r border-border bg-muted/90 backdrop-blur"
                     style={{ width: widthOf(c) }}>
                  <button
                    className={cn('flex h-[20px] w-full items-center justify-center border-b border-border/60 text-[10px] font-semibold',
                      colSel ? 'bg-primary/15 text-primary' : 'text-muted-foreground')}
                    onClick={e => {
                      // Select the whole column, extending with shift.
                      const a = e.shiftKey && anchor ? { r: 0, c: anchor.c } : { r: 0, c: ci };
                      setAnchor(a); setFocus({ r: view.length - 1, c: ci });
                      scroller.current?.focus();
                    }}
                  >
                    {colLetter(ci)}
                  </button>
                  <button
                    title="Sort"
                    onClick={() => setSort(s => s?.key !== c.key ? { key: c.key, dir: c.kind === 'measure' ? 'desc' : 'asc' }
                      : s.dir === 'desc' ? { key: c.key, dir: 'asc' } : null)}
                    className={cn('flex h-[33px] w-full items-center gap-1 px-2 text-left text-[11.5px] font-semibold',
                      c.kind === 'measure' && 'justify-end text-right', sorted ? 'text-primary' : 'text-foreground')}
                  >
                    <span className="truncate">{c.label}</span>
                    {sorted && (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)}
                  </button>
                  <span onPointerDown={e => startResize(e, c)}
                        className="absolute right-[-3px] top-0 z-10 h-full w-[6px] cursor-col-resize hover:bg-primary/40" />
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {view.slice(first, last).map((row, i) => {
            const r = first + i;
            const rowSel = sel && r >= sel.r0 && r <= sel.r1;
            return (
              <div key={r} className="absolute left-0 flex" style={{ top: HEAD_H + r * ROW_H, height: ROW_H, width: lefts.total }}>
                <div
                  className={cn('sticky left-0 z-10 flex shrink-0 items-center justify-end border-b border-r border-border px-2 text-[10.5px] tabular-nums',
                    rowSel ? 'bg-primary/15 font-semibold text-primary' : 'bg-muted text-muted-foreground')}
                  style={{ width: ROWNUM_W }}
                  onClick={e => {
                    const a = e.shiftKey && anchor ? { r: anchor.r, c: 0 } : { r, c: 0 };
                    setAnchor(a); setFocus({ r, c: columns.length - 1 });
                    scroller.current?.focus();
                  }}
                >
                  {r + 1}
                </div>
                {columns.map((c, ci) => {
                  const v = row[c.key];
                  const on = inSel(r, ci);
                  const isFocus = focus?.r === r && focus?.c === ci;
                  return (
                    <div
                      key={c.key}
                      role="gridcell"
                      onPointerDown={e => {
                        if (e.button === 2) return;
                        scroller.current?.focus();
                        if (e.shiftKey && anchor) setFocus({ r, c: ci });
                        else { setAnchor({ r, c: ci }); setFocus({ r, c: ci }); }
                        setDragging(true);
                      }}
                      onPointerEnter={() => { if (dragging) setFocus({ r, c: ci }); }}
                      onContextMenu={e => {
                        if (!onFilterValue) return;
                        e.preventDefault();
                        if (!on) { setAnchor({ r, c: ci }); setFocus({ r, c: ci }); }
                        setMenu({ x: e.clientX, y: e.clientY, pos: { r, c: ci } });
                      }}
                      className={cn(
                        'relative flex shrink-0 select-none items-center truncate border-b border-r border-border/60 px-2 text-[12.5px]',
                        c.kind === 'measure' || typeof v === 'number' ? 'justify-end tabular-nums' : '',
                        v == null ? 'text-muted-foreground/50' : 'text-foreground',
                        on && 'bg-primary/[0.09]',
                        isFocus && 'z-[5] outline outline-2 -outline-offset-2 outline-primary',
                      )}
                      style={{ width: widthOf(c) }}
                    >
                      <span className="truncate">{formatCell(v, c.format)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{view.length.toLocaleString()} row{view.length === 1 ? '' : 's'}</span>
        {stats && stats.count > 1 && (
          <span className="flex flex-wrap gap-x-4 tabular-nums">
            {stats.n > 0 && <span>Sum <b className="font-semibold text-foreground">{formatCell(Math.round(stats.sum * 100) / 100)}</b></span>}
            {stats.n > 0 && <span>Average <b className="font-semibold text-foreground">{formatCell(Math.round(stats.avg * 100) / 100)}</b></span>}
            {stats.n > 0 && <span className="hidden sm:inline">Min <b className="font-semibold text-foreground">{formatCell(stats.min)}</b></span>}
            {stats.n > 0 && <span className="hidden sm:inline">Max <b className="font-semibold text-foreground">{formatCell(stats.max)}</b></span>}
            <span>Count <b className="font-semibold text-foreground">{stats.count.toLocaleString()}</b></span>
          </span>
        )}
      </div>

      {menu && onFilterValue && (() => {
        const col = columns[menu.pos.c];
        const v = view[menu.pos.r]?.[col.key];
        const label = formatCell(v, col.format) || '(blank)';
        return (
          <div
            className="lp-glass fixed z-[90] min-w-[200px] overflow-hidden rounded-xl border p-1 text-[12.5px] shadow-[var(--elev-3)]"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={e => e.stopPropagation()}
          >
            <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { copy(); setMenu(null); }}>Copy</MenuItem>
            {col.kind === 'dimension' && (
              <>
                <MenuItem icon={<Filter className="h-3.5 w-3.5" />} onClick={() => { onFilterValue(col.key, v, false); setMenu(null); }}>
                  Only <b className="font-semibold">{label}</b>
                </MenuItem>
                <MenuItem icon={<X className="h-3.5 w-3.5" />} onClick={() => { onFilterValue(col.key, v, true); setMenu(null); }}>
                  Exclude <b className="font-semibold">{label}</b>
                </MenuItem>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function MenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 truncate rounded-lg px-2.5 py-1.5 text-left text-foreground hover:bg-primary/10">
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

/** CSV for download. Quotes anything that needs it. */
export function toCsv(columns: ResultColumn[], rows: Row[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    columns.map(c => q(c.label)).join(','),
    ...rows.map(r => columns.map(c => q(r[c.key] == null ? '' : String(r[c.key]))).join(',')),
  ].join('\n');
}
