'use client';

/**
 * Saved reports: a dashboard of charts, rearranged by dragging.
 *
 * Each tile is a query spec, not a picture of one, so a report re-runs
 * against today's data every time it is opened and stays current without
 * being rebuilt.
 */

import { useId, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext, PointerSensor, KeyboardSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { runQuery } from '@/lib/analytics/engine';
import { datasetById } from '@/lib/analytics/schema';
import { useTable, templates, newId, type Report, type Widget } from '@/lib/analytics/client';
import ChartView, { resolveChart } from './ChartView';
import DataGrid from './DataGrid';
import { IconChip } from '@/components/ui/kit';
import {
  GripHorizontal, Trash2, Copy, Maximize2, Minimize2, Share2, Plus, LayoutDashboard, Sparkles, Check,
  SlidersHorizontal,
} from '@/components/icons';

function WidgetBody({ w }: { w: Widget }) {
  const { rows, error } = useTable(w.spec.dataset);
  const result = useMemo(() => (rows ? runQuery(rows, w.spec) : null), [rows, w.spec]);
  if (error) return <p className="py-10 text-center text-[13px] text-muted-foreground">Could not load this data.</p>;
  if (!result) return <div className="lp-skeleton h-[240px] w-full rounded-xl" />;
  return resolveChart(w.spec, result) === 'table'
    ? <DataGrid columns={result.columns} rows={result.rows} height={260} />
    : <ChartView spec={w.spec} result={result} height={240} />;
}

function Tile({ w, onEdit, onRemove, onDuplicate, onToggleWide, onRename }: {
  w: Widget; onEdit: () => void; onRemove: () => void; onDuplicate: () => void;
  onToggleWide: () => void; onRename: (t: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const ds = datasetById(w.spec.dataset);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('lp-surface lp-edge group flex flex-col rounded-2xl p-4', w.wide && 'lg:col-span-2',
        isDragging && 'z-20 shadow-[var(--elev-3)] ring-1 ring-primary/40')}
    >
      <div className="mb-3 flex items-center gap-2">
        <button {...attributes} {...listeners} aria-label="Drag to reorder"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <GripHorizontal className="h-4 w-4" />
        </button>
        <input
          defaultValue={w.spec.title ?? ''}
          placeholder="Untitled chart"
          onBlur={e => onRename(e.target.value)}
          className="min-w-0 flex-1 truncate bg-transparent font-display text-[15px] font-bold text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <span className="hidden shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">{ds?.label}</span>
        <div className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
          <IconBtn label="Edit" onClick={onEdit}><SlidersHorizontal className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label={w.wide ? 'Half width' : 'Full width'} onClick={onToggleWide} className="hidden lg:inline-flex">
            {w.wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn label="Duplicate" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label="Remove" onClick={onRemove} danger><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>
      <WidgetBody w={w} />
    </div>
  );
}

function IconBtn({ label, onClick, children, danger, className }: {
  label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; className?: string;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={cn('inline-flex rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted',
        danger ? 'hover:text-red-500' : 'hover:text-foreground', className)}>
      {children}
    </button>
  );
}

export default function ReportBoard({ reports, activeId, currentSeason, onChange, onSelect, onEdit, onShare }: {
  reports: Report[];
  activeId: string | null;
  currentSeason: string;
  onChange: (next: Report[]) => void;
  onSelect: (id: string | null) => void;
  /** Open a tile in the builder. */
  onEdit: (w: Widget, reportId: string) => void;
  onShare: (r: Report) => Promise<void>;
}) {
  const [shared, setShared] = useState(false);
  const dndId = useId();
  const active = reports.find(r => r.id === activeId) ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const update = (r: Report) =>
    onChange(reports.map(x => (x.id === r.id ? { ...r, updatedAt: new Date().toISOString() } : x)));
  const setWidgets = (ws: Widget[]) => active && update({ ...active, widgets: ws });

  const onDragEnd = (e: DragEndEvent) => {
    if (!active || !e.over || e.active.id === e.over.id) return;
    const from = active.widgets.findIndex(w => w.id === e.active.id);
    const to = active.widgets.findIndex(w => w.id === e.over!.id);
    setWidgets(arrayMove(active.widgets, from, to));
  };

  const gallery = templates(currentSeason);

  return (
    <div className="space-y-5">
      {/* Report switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {reports.map(r => (
          <button key={r.id} onClick={() => onSelect(r.id)}
            className={cn('rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              r.id === activeId ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            {r.name}
          </button>
        ))}
        <button onClick={() => onSelect(null)}
          className={cn('inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-[12.5px] font-semibold',
            !activeId ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
          <Plus className="h-3.5 w-3.5" /> New report
        </button>
      </div>

      {!active ? (
        <div>
          <div className="mb-4 flex items-center gap-2.5">
            <IconChip icon={Sparkles} size="md" />
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Start from a template</h2>
              <p className="text-[12.5px] text-muted-foreground">Each one is a live report. Edit any chart, or add your own from Explore.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((t, i) => (
              <motion.button key={t.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => { const r = t.build(); onChange([...reports, r]); onSelect(r.id); }}
                className="lp-surface lp-lift lp-sheen group rounded-2xl p-4 text-left">
                <IconChip icon={LayoutDashboard} size="md" />
                <p className="mt-3 font-display text-[16px] font-bold text-foreground">{t.name}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{t.blurb}</p>
                <p className="mt-3 text-[12px] font-semibold text-primary">Use this template</p>
              </motion.button>
            ))}
            <button
              onClick={() => { const r: Report = { id: newId(), name: 'Untitled report', widgets: [], updatedAt: new Date().toISOString() }; onChange([...reports, r]); onSelect(r.id); }}
              className="flex flex-col items-start rounded-2xl border border-dashed border-border p-4 text-left transition-colors hover:border-primary/50">
              <span className="lp-chip lp-chip-muted h-8 w-8 rounded-[10px] [&>svg]:h-4 [&>svg]:w-4"><Plus /></span>
              <p className="mt-3 font-display text-[16px] font-bold text-foreground">Blank report</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">Build charts in Explore and add them here.</p>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              key={active.id}
              defaultValue={active.name}
              onBlur={e => update({ ...active, name: e.target.value.trim() || 'Untitled report' })}
              className="min-w-0 flex-1 bg-transparent font-display text-2xl font-bold tracking-[-0.02em] text-foreground outline-none"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => { await onShare(active); setShared(true); setTimeout(() => setShared(false), 1600); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-muted">
                {shared ? <Check className="h-3.5 w-3.5 text-primary" /> : <Share2 className="h-3.5 w-3.5" />}
                {shared ? 'Link copied' : 'Share'}
              </button>
              <button
                onClick={() => { if (confirm(`Delete "${active.name}"?`)) { onChange(reports.filter(r => r.id !== active.id)); onSelect(null); } }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>

          {!active.widgets.length ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <p className="font-semibold text-foreground">This report is empty</p>
              <p className="mt-1 text-[13px] text-muted-foreground">Build a chart in Explore, then use &ldquo;Add to report&rdquo;.</p>
            </div>
          ) : (
            <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={active.widgets.map(w => w.id)} strategy={rectSortingStrategy}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {active.widgets.map(w => (
                      <Tile key={w.id} w={w}
                        onEdit={() => onEdit(w, active.id)}
                        onRemove={() => setWidgets(active.widgets.filter(x => x.id !== w.id))}
                        onDuplicate={() => {
                          const i = active.widgets.findIndex(x => x.id === w.id);
                          const copy = { ...w, id: newId(), spec: { ...w.spec, title: `${w.spec.title ?? 'Chart'} (copy)` } };
                          setWidgets([...active.widgets.slice(0, i + 1), copy, ...active.widgets.slice(i + 1)]);
                        }}
                        onToggleWide={() => setWidgets(active.widgets.map(x => x.id === w.id ? { ...x, wide: !x.wide } : x))}
                        onRename={t => setWidgets(active.widgets.map(x => x.id === w.id ? { ...x, spec: { ...x.spec, title: t } } : x))}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
