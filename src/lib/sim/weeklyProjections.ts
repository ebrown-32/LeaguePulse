/**
 * Sleeper's weekly player projections.
 *
 * These live on `api.sleeper.com`, NOT the older `api.sleeper.app/v1` host. The
 * v1 path at `/projections/nfl/regular/{season}/{week}` returns only ADP noise
 * with no `pts_ppr`, which is what led an earlier version of this simulator to
 * conclude, wrongly, that Sleeper published no weekly projections at all. It
 * does. This module uses the right endpoint.
 *
 * What they are worth knowing about them: the weekly numbers are largely a
 * distribution of a season-long outlook rather than a fresh matchup-by-matchup
 * model, so they should not be read as strong game-level predictions. What they
 * do capture reliably, and what matters most here, is AVAILABILITY: a player on
 * a bye simply has no projection that week. That is a real, physical effect on
 * a team's ceiling, and it is the main thing these add over a season total
 * divided by the number of weeks.
 */

const BASE = 'https://api.sleeper.com';

/** Positions worth asking for, derived from what the league actually starts. */
export function fantasyPositions(rosterSlots: string[]): string[] {
  const out = new Set<string>();
  for (const slot of rosterSlots) {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') continue;
    if (slot === 'FLEX')       { out.add('RB'); out.add('WR'); out.add('TE'); continue; }
    if (slot === 'SUPER_FLEX') { out.add('QB'); out.add('RB'); out.add('WR'); out.add('TE'); continue; }
    if (slot === 'REC_FLEX')   { out.add('WR'); out.add('TE'); continue; }
    if (slot === 'WRRB_FLEX')  { out.add('WR'); out.add('RB'); continue; }
    out.add(slot);
  }
  // Sensible default if a league's slots are unreadable.
  if (out.size === 0) ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(p => out.add(p));
  return [...out];
}

/**
 * One week of projections, reduced to `playerId -> projected PPR points`.
 *
 * The raw response is a couple of megabytes of embedded player objects, so it
 * is parsed and thrown away immediately, keeping only the numbers. Filtering by
 * position cuts the payload roughly in half by dropping IDP rows that leagues
 * like this one never start.
 */
export async function weeklyProjections(
  season: string,
  week: number,
  positions: string[],
): Promise<Map<string, number>> {
  const qs = new URLSearchParams({ season_type: 'regular' });
  for (const p of positions) qs.append('position[]', p);

  const out = new Map<string, number>();
  try {
    const res = await fetch(`${BASE}/projections/nfl/${season}/${week}?${qs}`, {
      // Projections move at most daily, and a stale hour costs nothing here.
      next: { revalidate: 21600 },
    });
    if (!res.ok) return out;
    const rows = await res.json();
    if (!Array.isArray(rows)) return out;
    for (const r of rows) {
      const pts = r?.stats?.pts_ppr;
      if (typeof pts === 'number' && r?.player_id) out.set(String(r.player_id), pts);
    }
  } catch {
    // A missing week degrades the model to its historical component rather
    // than failing the page.
  }
  return out;
}

/**
 * Fetch several weeks with a small concurrency cap.
 *
 * Sequential would take several seconds across a full season; unbounded would
 * hold a dozen multi-megabyte responses in memory at once.
 */
export async function weeklyProjectionsFor(
  season: string,
  weeks: number[],
  positions: string[],
  concurrency = 4,
): Promise<Map<number, Map<string, number>>> {
  const byWeek = new Map<number, Map<string, number>>();
  const queue = [...weeks];

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (;;) {
        const wk = queue.shift();
        if (wk === undefined) return;
        byWeek.set(wk, await weeklyProjections(season, wk, positions));
      }
    }),
  );
  return byWeek;
}
