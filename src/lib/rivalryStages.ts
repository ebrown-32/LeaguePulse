/**
 * A head to head record's stages (lib/rivalries): pure, so pages in the
 * browser can say what a record is made of without loading the server code.
 */

export type Stage = 'regular' | 'playoff' | 'consolation';
export interface StageRecord { wins: number; losses: number; ties: number }

const fmt = (r: StageRecord) => (r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`);

/**
 * "12-3 regular season, 1-0 playoffs, 1-0 consolation": what a head to head
 * record is made of, the stages played only. Shared by every page that shows one.
 */
export function stageBreakdown(e: { byStage: Record<Stage, StageRecord> }): string {
  const parts: [Stage, string][] = [['regular', 'regular season'], ['playoff', 'playoffs'], ['consolation', 'consolation']];
  return parts
    .filter(([k]) => { const r = e.byStage[k]; return r.wins + r.losses + r.ties > 0; })
    .map(([k, label]) => `${fmt(e.byStage[k])} ${label}`)
    .join(', ');
}
