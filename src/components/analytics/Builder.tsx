'use client';

/**
 * The drag and drop report builder: a field list and three shelves.
 *
 * Fields drag onto Group by, Values or Filters, and reorder within a shelf.
 * Every field can also be tapped, which puts it on the shelf it most likely
 * belongs on, because dragging is the wrong gesture on a phone and the
 * keyboard needs a way in too. dnd-kit handles touch, mouse and keyboard
 * sensors alike; native HTML drag and drop does not work on touch screens.
 */

import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor, useDraggable, useDroppable,
  useSensor, useSensors, closestCenter, pointerWithin, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  AGGS, fieldOf, datasetById, type Agg, type Dataset, type Field, type Filter, type Measure, type QuerySpec,
} from '@/lib/analytics/schema';
import { distinctValues, formatCell, type Row } from '@/lib/analytics/engine';
import {
  Search, X, GripHorizontal, Filter as FilterIcon, Layers, Plus, Check, ChevronDown,
} from '@/components/icons';

type Shelf = 'dimensions' | 'measures' | 'filters';
const SHELF_MAX: Record<Shelf, number> = { dimensions: 2, measures: 3, filters: 8 };

/** The aggregation a field gets when dropped on Values. */
export function defaultAgg(f: Field): Agg {
  if (f.type === 'boolean') return 'count';
  if (f.type === 'string') return 'distinct';
  return f.format === 'pct' ? 'avg' : 'sum';
}

function defaultFilter(f: Field, rows: Row[]): Filter {
  if (f.type === 'boolean') return { field: f.key, op: 'is', value: true };
  if (f.type === 'number' && f.role === 'measure') return { field: f.key, op: 'gt', value: 0 };
  const first = distinctValues(rows, f.key, f.ordinal)[0];
  return { field: f.key, op: 'in', value: first == null ? [] : [first as string | number] };
}

// ── Field list ───────────────────────────────────────────────────────────────

/** How a field looks, dragged or not. */
function FieldChipView({ field, lifted }: { field: Field; lifted?: boolean }) {
  const measure = field.role === 'measure';
  return (
    <>
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
        measure ? 'lp-chip' : 'lp-chip lp-chip-muted')}>
        {measure ? '#' : field.type === 'boolean' ? '?' : 'A'}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{field.label}</span>
      {!lifted && <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
    </>
  );
}

const CHIP_CLS = 'group flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[12.5px] transition-colors';

function FieldChip({ field, onAdd }: { field: Field; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `field:${field.key}`, data: { field } });
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={onAdd} title={field.description}
      className={cn(CHIP_CLS, 'border-transparent hover:border-border hover:bg-muted/50', isDragging && 'opacity-40')}>
      <FieldChipView field={field} />
    </button>
  );
}

export function FieldPanel({ dataset, onAdd }: { dataset: Dataset; onAdd: (f: Field) => void }) {
  const [q, setQ] = useState('');
  const match = (f: Field) => !q || `${f.label} ${f.description}`.toLowerCase().includes(q.toLowerCase());
  const dims = dataset.fields.filter(f => f.role === 'dimension' && match(f));
  const measures = dataset.fields.filter(f => f.role === 'measure' && match(f));
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a field"
          className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/50" />
      </label>
      <FieldGroup title="Dimensions" hint="Group and filter by">{dims.map(f => <FieldChip key={f.key} field={f} onAdd={() => onAdd(f)} />)}</FieldGroup>
      <FieldGroup title="Measures" hint="Add up and average">{measures.map(f => <FieldChip key={f.key} field={f} onAdd={() => onAdd(f)} />)}</FieldGroup>
    </div>
  );
}

function FieldGroup({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground/70">{hint}</span>
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

// ── Shelves ──────────────────────────────────────────────────────────────────

function ShelfZone({ id, label, icon, empty, children, count }: {
  id: Shelf; label: string; icon: ReactNode; empty: string; children: ReactNode; count: number;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `shelf:${id}` });
  const dragging = Boolean(active);
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex w-24 shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}{label}
      </span>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[40px] flex-1 flex-wrap items-center gap-1.5 rounded-xl border border-dashed px-2 py-1.5 transition-colors',
          isOver ? 'border-primary bg-primary/[0.07]' : dragging ? 'border-primary/40 bg-primary/[0.02]' : 'border-border',
        )}
      >
        {count === 0 && <span className="px-1 text-[12px] text-muted-foreground/70">{empty}</span>}
        {children}
      </div>
    </div>
  );
}

function SortableChip({ id, children, onRemove, tone }: {
  id: string; children: ReactNode; onRemove: () => void; tone: 'dim' | 'measure' | 'filter';
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-lg border py-0.5 pl-1 pr-1 text-[12.5px] shadow-[var(--elev-1)]',
        tone === 'measure' ? 'border-primary/30 bg-primary/10 text-foreground'
          : tone === 'filter' ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
          : 'border-border bg-card text-foreground',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label="Reorder">
        <GripHorizontal className="h-3.5 w-3.5" />
      </span>
      {children}
      <button onClick={onRemove} aria-label="Remove" className="rounded p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function filterSummary(ds: Dataset, f: Filter): string {
  const field = fieldOf(ds, f.field);
  const name = field?.label ?? f.field;
  if (f.op === 'is') return `${name}: ${f.value === true || f.value === 'true' ? 'Yes' : 'No'}`;
  if (f.op === 'in') {
    const vals = Array.isArray(f.value) ? f.value : [f.value];
    if (!vals.length) return `${name}: any`;
    return `${name}: ${vals.slice(0, 2).join(', ')}${vals.length > 2 ? ` +${vals.length - 2}` : ''}`;
  }
  const sym: Record<string, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains' };
  return `${name} ${sym[f.op] ?? f.op} ${String(f.value)}`;
}

/** Editing one filter, in a small popover under its chip. */
function FilterEditor({ ds, filter, rows, onChange, onClose }: {
  ds: Dataset; filter: Filter; rows: Row[]; onChange: (f: Filter) => void; onClose: () => void;
}) {
  const field = fieldOf(ds, filter.field)!;
  const [q, setQ] = useState('');
  const values = useMemo(() => distinctValues(rows, field.key, field.ordinal), [rows, field]);
  const chosen = new Set((Array.isArray(filter.value) ? filter.value : [filter.value]).map(String));

  return (
    <div className="lp-glass absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border p-3 shadow-[var(--elev-3)]"
         onPointerDown={e => e.stopPropagation()}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{field.label}</span>
        <button onClick={onClose} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><Check className="h-4 w-4" /></button>
      </div>

      {field.type === 'boolean' ? (
        <div className="flex gap-1.5">
          {[true, false].map(v => (
            <button key={String(v)} onClick={() => onChange({ field: field.key, op: 'is', value: v })}
              className={cn('flex-1 rounded-lg border py-1.5 text-[12.5px] font-semibold',
                String(filter.value) === String(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border')}>
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      ) : field.type === 'number' && field.role === 'measure' ? (
        <div className="flex gap-1.5">
          <select value={filter.op} onChange={e => onChange({ ...filter, op: e.target.value as Filter['op'] })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]">
            {[['gt', '>'], ['gte', '≥'], ['lt', '<'], ['lte', '≤'], ['eq', '=']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="number" value={String(filter.value)} onChange={e => onChange({ ...filter, value: Number(e.target.value) })}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] tabular-nums" />
        </div>
      ) : (
        <>
          <div className="mb-2 flex gap-1.5">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search values"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px]" />
          </div>
          <div className="flex gap-2 pb-1.5 text-[11px]">
            <button className="font-semibold text-primary" onClick={() => onChange({ ...filter, op: 'in', value: values.filter(v => v != null) as (string | number)[] })}>All</button>
            <button className="font-semibold text-primary" onClick={() => onChange({ ...filter, op: 'in', value: [] })}>None</button>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-auto">
            {values.filter(v => !q || String(v).toLowerCase().includes(q.toLowerCase())).slice(0, 200).map(v => {
              const k = String(v);
              const on = chosen.has(k);
              return (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] hover:bg-muted/60">
                  <input type="checkbox" checked={on} className="accent-[hsl(var(--primary))]"
                    onChange={() => {
                      const list = (Array.isArray(filter.value) ? filter.value : []).map(x => x);
                      const next = on ? list.filter(x => String(x) !== k) : [...list, v as string | number];
                      onChange({ field: field.key, op: 'in', value: next });
                    }} />
                  <span className="truncate">{formatCell(v, field.format) || '(blank)'}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export interface BuilderProps {
  spec: QuerySpec;
  rows: Row[];
  onChange: (spec: QuerySpec) => void;
  /**
   * Lays the page out. The drag context has to span the field list and the
   * shelves, wherever the page puts them, so the builder owns the context and
   * hands back the two pieces: an action that adds a field, and the shelves.
   */
  children: (parts: { add: (f: Field) => void; shelves: ReactNode }) => ReactNode;
}

export default function Builder({ spec, rows, onChange, children }: BuilderProps) {
  const ds = datasetById(spec.dataset)!;
  const [dragField, setDragField] = useState<Field | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  // Stable across server and client render; dnd-kit's own counter is not, and
  // its accessibility ids then fail hydration.
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const addTo = (shelf: Shelf, f: Field) => {
    if (shelf === 'dimensions') {
      if (spec.dimensions.includes(f.key) || spec.dimensions.length >= SHELF_MAX.dimensions) return;
      onChange({ ...spec, dimensions: [...spec.dimensions, f.key], sort: undefined });
    } else if (shelf === 'measures') {
      if (spec.measures.length >= SHELF_MAX.measures) return;
      const m: Measure = { field: f.key, agg: defaultAgg(f) };
      if (spec.measures.some(x => x.field === m.field && x.agg === m.agg)) return;
      onChange({ ...spec, measures: [...spec.measures, m], sort: undefined });
    } else {
      if (spec.filters.length >= SHELF_MAX.filters) return;
      onChange({ ...spec, filters: [...spec.filters, defaultFilter(f, rows)] });
      setEditing(spec.filters.length);
    }
  };

  /** Tap to add: dimensions group, measures sum, and a full shelf falls back to filters. */
  const quickAdd = (f: Field) => {
    if (f.role === 'measure') return addTo('measures', f);
    if (spec.dimensions.length < SHELF_MAX.dimensions) return addTo('dimensions', f);
    addTo('filters', f);
  };

  /**
   * Where a drop lands: under the pointer when there is something there, so a
   * field let go over a shelf goes to that shelf, and the nearest item only as
   * a fallback, which is what reordering within a shelf wants.
   */
  const collision: CollisionDetection = args => {
    const hit = pointerWithin(args);
    return hit.length ? hit : closestCenter(args);
  };

  const onDragStart = (e: DragStartEvent) => setDragField((e.active.data.current?.field as Field) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragField(null);
    const { active, over } = e;
    if (!over) return;
    const aid = String(active.id), oid = String(over.id);
    if (aid.startsWith('field:')) {
      const f = fieldOf(ds, aid.slice(6));
      // Let go over a chip already on a shelf counts as that shelf: the chips
      // are drop targets too, for reordering, and fill most of a busy shelf.
      const chipShelf: Record<string, Shelf> = { d: 'dimensions', m: 'measures', f: 'filters' };
      const shelf = oid.startsWith('shelf:') ? oid.slice(6) as Shelf : chipShelf[oid.split(':')[0]];
      if (f && shelf) addTo(shelf, f);
      return;
    }
    // Reorder within a shelf.
    const [shelfA, ia] = aid.split(':'); const [shelfB, ib] = oid.split(':');
    if (shelfA !== shelfB || ia === ib) return;
    if (shelfA === 'd') onChange({ ...spec, dimensions: arrayMove(spec.dimensions, Number(ia), Number(ib)), sort: undefined });
    if (shelfA === 'm') onChange({ ...spec, measures: arrayMove(spec.measures, Number(ia), Number(ib)) });
  };

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {children({ add: quickAdd, shelves: (
      <div className="space-y-2.5">
        <ShelfZone id="dimensions" label="Group by" icon={<Layers className="h-3.5 w-3.5" />} count={spec.dimensions.length}
          empty="Drop a dimension here, or tap one">
          <SortableContext items={spec.dimensions.map((_, i) => `d:${i}`)} strategy={horizontalListSortingStrategy}>
            {spec.dimensions.map((k, i) => (
              <SortableChip key={`d:${i}`} id={`d:${i}`} tone="dim"
                onRemove={() => onChange({ ...spec, dimensions: spec.dimensions.filter((_, j) => j !== i), sort: undefined })}>
                <span className="truncate px-0.5">{fieldOf(ds, k)?.label ?? k}</span>
                {i === 1 && <span className="rounded bg-muted px-1 text-[9.5px] font-bold uppercase text-muted-foreground">series</span>}
              </SortableChip>
            ))}
          </SortableContext>
        </ShelfZone>

        <ShelfZone id="measures" label="Values" icon={<span className="text-[13px] leading-none">Σ</span>} count={spec.measures.length}
          empty="Drop a measure here. Nothing here counts rows">
          <SortableContext items={spec.measures.map((_, i) => `m:${i}`)} strategy={horizontalListSortingStrategy}>
            {spec.measures.map((m, i) => {
              const f = fieldOf(ds, m.field);
              const aggs = f?.type === 'number' ? AGGS : AGGS.filter(a => a.id === 'count' || a.id === 'distinct');
              return (
                <SortableChip key={`m:${i}`} id={`m:${i}`} tone="measure"
                  onRemove={() => onChange({ ...spec, measures: spec.measures.filter((_, j) => j !== i), sort: undefined })}>
                  <span className="relative inline-flex items-center">
                    <select value={m.agg} aria-label="Aggregation"
                      onChange={e => onChange({ ...spec, sort: undefined, measures: spec.measures.map((x, j) => j === i ? { ...x, agg: e.target.value as Agg } : x) })}
                      className="cursor-pointer appearance-none rounded bg-transparent py-0.5 pl-1 pr-4 text-[11px] font-bold uppercase tracking-wide text-primary outline-none">
                      {aggs.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 h-3 w-3 text-primary" />
                  </span>
                  <span className="truncate">{m.field === '*' ? 'Rows' : f?.label ?? m.field}</span>
                </SortableChip>
              );
            })}
          </SortableContext>
        </ShelfZone>

        <ShelfZone id="filters" label="Filters" icon={<FilterIcon className="h-3.5 w-3.5" />} count={spec.filters.length}
          empty="Drop any field to filter by it">
          <SortableContext items={spec.filters.map((_, i) => `f:${i}`)} strategy={horizontalListSortingStrategy}>
            {spec.filters.map((f, i) => (
              <span key={`f:${i}`} className="relative">
                <SortableChip id={`f:${i}`} tone="filter"
                  onRemove={() => { onChange({ ...spec, filters: spec.filters.filter((_, j) => j !== i) }); setEditing(null); }}>
                  <button onClick={() => setEditing(editing === i ? null : i)} className="truncate px-0.5 hover:underline">
                    {filterSummary(ds, f)}
                  </button>
                </SortableChip>
                {editing === i && (
                  <FilterEditor ds={ds} filter={f} rows={rows}
                    onChange={nf => onChange({ ...spec, filters: spec.filters.map((x, j) => j === i ? nf : x) })}
                    onClose={() => setEditing(null)} />
                )}
              </span>
            ))}
          </SortableContext>
        </ShelfZone>
      </div>
      ) })}

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {dragField && (
          <div className={cn(CHIP_CLS, 'w-56 border-primary/50 bg-card shadow-[var(--elev-3)]')}>
            <FieldChipView field={dragField} lifted />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
