/**
 * A league's archive as a file to download: CSV (one table, or a zip of all
 * of them), an Excel workbook with a sheet per table, or JSON.
 *
 * Server only.
 */

import ExcelJS from 'exceljs';
import { zipSync, strToU8 } from 'fflate';
import { ensureArchive, T } from './db';
import { buildTables, toCsv, toRecords, type ArchiveRows, type DatasetId, type Table } from './tables';

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface ArchiveStatus {
  seasons: { season: number; provider: string; final: boolean }[];
  lastArchived: string | null;
  name: string | null;
}

export async function archiveStatus(site: string): Promise<ArchiveStatus> {
  const db = (await ensureArchive())!;
  const [seasons, run] = await Promise.all([
    db.query(`SELECT season, provider, final, name FROM ${T('seasons')} WHERE site = $1 ORDER BY season DESC`, [site]),
    db.query(`SELECT finished_at FROM ${T('archive_runs')} WHERE site = $1 AND error IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`, [site]),
  ]);
  return {
    seasons: seasons.rows.map(r => ({ season: r.season, provider: r.provider, final: r.final })),
    lastArchived: run.rows[0]?.finished_at ? new Date(run.rows[0].finished_at).toISOString() : null,
    name: seasons.rows[0]?.name ?? null,
  };
}

/** Everything the archive holds for a league, or for one of its seasons. */
async function loadRows(site: string, season: number | null): Promise<ArchiveRows> {
  const db = (await ensureArchive())!;
  const seasonRows = (await db.query(
    `SELECT season_id, season, name, settings FROM ${T('seasons')} WHERE site = $1 AND ($2::int IS NULL OR season = $2) ORDER BY season DESC`,
    [site, season],
  )).rows;
  const ids = seasonRows.map(s => s.season_id);
  const q = async (sql: string) => (await db.query(sql, [site, ids])).rows;
  const where = `WHERE site = $1 AND season_id = ANY($2)`;
  const [managers, teams, matchups, transactions, draft_picks] = await Promise.all([
    db.query(`SELECT user_id, display_name FROM ${T('managers')} WHERE site = $1`, [site]).then(r => r.rows),
    q(`SELECT season_id, roster_id, owner_id, team_name, wins, losses, ties, points_for, points_against FROM ${T('teams')} ${where}`),
    q(`SELECT season_id, week, roster_id, matchup_id, points, starters, players, players_points FROM ${T('matchups')} ${where}`),
    q(`SELECT season_id, week, type, status, created_at, roster_ids, adds, drops, draft_picks, faab_bid, source FROM ${T('transactions')} ${where}`),
    q(`SELECT season_id, round, pick_no, roster_id, picked_by, player_id, player_name, position, nfl_team, is_keeper, amount FROM ${T('draft_picks')} ${where}`),
  ]);
  const playerIds = new Set<string>();
  for (const m of matchups) for (const id of m.players ?? []) playerIds.add(id);
  for (const t of transactions) for (const id of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) playerIds.add(id);
  for (const p of draft_picks) if (p.player_id) playerIds.add(p.player_id);
  const players = (await db.query(`SELECT player_id, full_name, position, team FROM ${T('players')} WHERE player_id = ANY($1)`, [[...playerIds]])).rows;
  return { seasons: seasonRows, managers, teams, matchups, transactions, draft_picks, players };
}

const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'league';

export async function exportArchive(o: { site: string; format: ExportFormat; dataset: DatasetId | 'all'; season: number | null }): Promise<{ body: Uint8Array; type: string; filename: string }> {
  const status = await archiveStatus(o.site);
  const tables = buildTables(await loadRows(o.site, o.season), o.dataset === 'all' ? undefined : [o.dataset]);
  const base = `${fileSlug(status.name ?? o.site)}-${o.dataset === 'all' ? 'archive' : o.dataset}-${o.season ?? 'all-seasons'}`;

  if (o.format === 'json') {
    const doc = {
      league: status.name, exportedAt: new Date().toISOString(), seasons: o.season ? [o.season] : status.seasons.map(s => s.season),
      ...Object.fromEntries(tables.map(t => [t.name, toRecords(t)])),
    };
    return { body: strToU8(JSON.stringify(doc, null, 2)), type: 'application/json', filename: `${base}.json` };
  }

  if (o.format === 'csv') {
    if (tables.length === 1) return { body: strToU8(toCsv(tables[0])), type: 'text/csv; charset=utf-8', filename: `${base}.csv` };
    const files = Object.fromEntries(tables.map(t => [`${t.name}.csv`, strToU8(toCsv(t))]));
    return { body: zipSync(files, { level: 6 }), type: 'application/zip', filename: `${base}.zip` };
  }

  return { body: await workbook(tables), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}.xlsx` };
}

async function workbook(tables: Table[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LeaguePulse';
  for (const t of tables) {
    const ws = wb.addWorksheet(t.title, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(t.columns).font = { bold: true };
    ws.addRows(t.rows);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } };
    ws.columns.forEach((col, i) => {
      const longest = Math.max(t.columns[i].length, ...t.rows.slice(0, 500).map(r => String(r[i] ?? '').length));
      col.width = Math.min(60, Math.max(8, longest + 2));
    });
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
