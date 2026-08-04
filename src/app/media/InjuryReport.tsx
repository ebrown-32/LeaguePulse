'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { InjuryEntry } from '@/lib/mediaSources';

const STATUS_COLOR: Record<string, string> = {
  Out: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  'Injured Reserve': 'text-rose-500 bg-rose-500/10 border-rose-500/20',
  Doubtful: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Questionable: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  Active: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

const DEFAULT_STATUSES = ['Out', 'Doubtful', 'Questionable', 'Injured Reserve'];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function InjuryReport({ teamId }: { teamId?: string }) {
  const [injuries, setInjuries] = useState<InjuryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatuses, setActiveStatuses] = useState<string[]>(DEFAULT_STATUSES);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (teamId) params.set('team', teamId);
    fetch(`/api/media/injuries?${params}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setInjuries(data.injuries || []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [teamId]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    injuries.forEach(i => { counts[i.status] = (counts[i.status] || 0) + 1; });
    return counts;
  }, [injuries]);

  const allStatuses = useMemo(
    () => Object.keys(statusCounts).sort((a, b) => (DEFAULT_STATUSES.indexOf(a) === -1 ? 99 : DEFAULT_STATUSES.indexOf(a)) - (DEFAULT_STATUSES.indexOf(b) === -1 ? 99 : DEFAULT_STATUSES.indexOf(b))),
    [statusCounts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return injuries.filter(i => {
      if (!activeStatuses.includes(i.status)) return false;
      if (!q) return true;
      return i.playerName.toLowerCase().includes(q) || i.team.toLowerCase().includes(q);
    });
  }, [injuries, activeStatuses, query]);

  const toggleStatus = (status: string) => {
    setActiveStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
    setVisibleCount(30);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setVisibleCount(30); }}
        placeholder="Search player or team..."
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      />

      <div className="flex flex-wrap gap-2">
        {allStatuses.map(status => (
          <button
            key={status}
            onClick={() => toggleStatus(status)}
            className={cn(
              'text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1.5 rounded-full border transition-colors',
              activeStatuses.includes(status)
                ? STATUS_COLOR[status] || 'text-primary bg-primary/10 border-primary/20'
                : 'text-muted-foreground bg-muted border-border hover:text-foreground'
            )}
          >
            {status} <span className="opacity-60">{statusCounts[status]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No injuries match your filters.</div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, visibleCount).map((injury, i) => (
            <motion.div
              key={injury.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground truncate">{injury.playerName}</h3>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      {injury.position} · {injury.team}
                    </span>
                  </div>
                  {injury.comment && (
                    <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{injury.comment}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={cn('text-[9px] font-semibold uppercase tracking-widest px-2 py-1 rounded border', STATUS_COLOR[injury.status] || 'text-muted-foreground bg-muted border-border')}>
                    {injury.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(injury.date)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {visibleCount < filtered.length && (
        <div className="text-center pt-3">
          <button
            onClick={() => setVisibleCount(c => c + 30)}
            className="px-6 py-2.5 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors text-sm font-medium text-foreground"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
