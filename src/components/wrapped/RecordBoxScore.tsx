'use client';

/**
 * A Record Book game's box score, read on demand (api/wrapped/box): both teams and their lineups.
 * Shown only when the archive has the game as the Record Book does, so the two never disagree.
 */

import { useEffect, useState } from 'react';
import BoxScore from '@/components/wrapped/BoxScore';
import type { BoxScore as Box } from '@/lib/wrapped/engine';

export default function RecordBoxScore({ season, week, owner, scores }: { season: string | number; week: number; owner: string; scores?: [number, number] }) {
  const [box, setBox] = useState<Box | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetch(`/api/wrapped/box?season=${season}&week=${week}&owner=${encodeURIComponent(owner)}`)
      .then(r => (r.ok ? r.json() : { box: null }))
      .then(d => { if (live) setBox(d.box ?? null); })
      .catch(() => { if (live) setBox(null); });
    return () => { live = false; };
  }, [season, week, owner]);

  if (box === undefined) return <div className="h-40 animate-pulse rounded-2xl bg-muted/50" />;
  const agrees = box && (!scores || (
    Math.abs(Math.max(box.winner.pts, box.loser.pts) - Math.max(...scores)) < 0.01 &&
    Math.abs(Math.min(box.winner.pts, box.loser.pts) - Math.min(...scores)) < 0.01));
  if (!box || !agrees) return <p className="py-3 text-center text-xs text-muted-foreground">The lineups for this game aren’t in the archive yet.</p>;
  return <BoxScore box={box} tone="page" />;
}
