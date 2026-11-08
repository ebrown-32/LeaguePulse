'use client';

/**
 * The Desk Weekly, in the AI Desk admin: every finished week of the season, with its episode or a
 * button to record one. Earlier weeks are written as look backs, from that week as it stood.
 * Episodes still record themselves every Tuesday; this is for catching up, or a do-over.
 * Replacing an episode is limited to once a week per league (the server enforces it).
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Headphones } from '@/components/icons';
import { cn } from '@/lib/utils';

interface WeekRow { week: number; episode: { id: string; title: string; createdAt: string } | null }
interface Data { season: string; weeks: WeekRow[]; aiReady: boolean; nextRerecordAt: string | null }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

export default function PodcastAdmin({ password }: { password: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<{ week: number; text: string } | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/podcast/weeks', { headers: { 'x-admin-password': password } }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (r?.ok && d) { setData(d); setLoadError(''); } else setLoadError(d?.error || 'Could not load the season.');
  }, [password]);
  useEffect(() => { load(); }, [load]);

  const record = async (row: WeekRow) => {
    if (busy !== null) return;
    if (row.episode && !window.confirm(`Re-record week ${row.week}? The new episode replaces "${row.episode.title}". You can re-record one episode a week.`)) return;
    setBusy(row.week); setError(null); setDone(null);
    try {
      const r = await fetch('/api/podcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ week: row.week }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) await load();
      if (!r.ok) throw new Error(d.error || 'The episode could not be written.');
      setDone(row.week);
      await load();
    } catch (e) {
      setError({ week: row.week, text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(null);
  };

  if (loadError) return <p className="text-xs text-red-500">{loadError}</p>;
  if (!data) return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A new episode records itself every Tuesday once the week is final. Record any earlier week
        here: the Desk looks back at it as it stood then, with that week&apos;s results and table.
        Three or four of your personalities host, a different group each time. About ninety seconds each.
        You can re-record one episode a week.
      </p>
      {data.nextRerecordAt && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This week&apos;s re-record is used. The next one opens {day(data.nextRerecordAt)}. Weeks without an episode can still be recorded.
        </p>
      )}
      {!data.aiReady && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          Add the league&apos;s AI key above to record episodes.
        </p>
      )}
      {!data.weeks.length ? (
        <p className="text-xs text-muted-foreground">No week of the {data.season} season has finished yet.</p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {data.weeks.map(row => {
            const working = busy === row.week;
            const locked = Boolean(row.episode && data.nextRerecordAt);
            return (
              <li key={row.week} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Week {row.week}</span>
                  {row.episode ? (
                    <a href={`/podcast?ep=${encodeURIComponent(row.episode.id)}`} target="_blank" rel="noreferrer"
                      className="group inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
                      <Headphones className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{row.episode.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">No episode</span>
                  )}
                  {done === row.week && <span className="mt-0.5 block text-[11px] font-medium text-primary">Recorded. It&apos;s live on The Desk Weekly.</span>}
                  {error?.week === row.week && <span className="mt-0.5 block text-[11px] text-red-500">{error.text}</span>}
                </span>
                <button type="button" onClick={() => record(row)} disabled={!data.aiReady || locked || (busy !== null && !working)}
                  title={locked && data.nextRerecordAt ? `Next re-record opens ${day(data.nextRerecordAt)}` : undefined}
                  className={cn('min-h-[36px] shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-50',
                    row.episode ? 'border border-border text-foreground hover:border-primary/40 hover:text-primary' : 'bg-primary text-primary-foreground hover:opacity-90')}>
                  {working ? 'Recording…' : row.episode ? 'Re-record' : 'Record'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
