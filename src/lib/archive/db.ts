/**
 * The league archive's database: Postgres (Neon, provisioned through the
 * Vercel Marketplace), separate from the Redis cache.
 *
 * Redis keeps things fast and may forget; this keeps every league's data for
 * good, in one shape for every provider (see schema.ts). Optional: with no
 * DATABASE_URL (a self-hosted league that never set one up) `archiveDb()` is
 * null and nothing that reads or writes the archive runs.
 *
 * Local runs write to their own Postgres schema, `dev` (LP_DB_SCHEMA, set by
 * `npm run dev:hosted`), the same way local Redis keys sit under `dev:`, so a
 * laptop never writes over the real archive.
 *
 * Server only.
 */

import { Pool, type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { MIGRATIONS } from './schema';

let pool: Pool | null = null;
let ready: Promise<void> | null = null;

/** The Postgres schema this deployment's tables live in. */
export function archiveSchema(): string {
  const s = process.env.LP_DB_SCHEMA?.trim() || 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`LP_DB_SCHEMA "${s}" is not a valid schema name`);
  return s;
}

/** A table's qualified name, for building SQL. Names here are ours, never user input. */
export const T = (table: string) => `"${archiveSchema()}"."${table}"`;

export function archiveConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** The pool, created on first use; null when the archive is not set up. */
export function archiveDb(): Pool | null {
  if (!archiveConfigured()) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
    // Lets Fluid compute close idle connections before a function suspends.
    attachDatabasePool(pool);
  }
  return pool;
}

/** Brings the schema up to date, once per process. */
export async function ensureArchive(): Promise<Pool | null> {
  const db = archiveDb();
  if (!db) return null;
  ready ??= migrate(db).catch(err => { ready = null; throw err; });
  await ready;
  return db;
}

async function migrate(db: Pool): Promise<void> {
  const schema = archiveSchema();
  const client = await db.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${T('migrations')} (id int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query(`SELECT id FROM ${T('migrations')}`)).rows.map(r => Number(r.id)));
    for (const [i, sql] of MIGRATIONS.entries()) {
      const id = i + 1;
      if (done.has(id)) continue;
      await inTransaction(client, async () => {
        await client.query(sql(T));
        await client.query(`INSERT INTO ${T('migrations')} (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
      });
    }
  } finally {
    client.release();
  }
}

export async function inTransaction<R>(client: PoolClient, fn: () => Promise<R>): Promise<R> {
  await client.query('BEGIN');
  try {
    const r = await fn();
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * Inserts rows in batches. Column order follows `cols`; jsonb columns take
 * plain objects (serialised here). With `conflict` set, existing rows with
 * the same key are updated instead.
 */
export async function insertRows(
  client: PoolClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  conflict?: { key: string[] },
): Promise<number> {
  const BATCH = Math.max(1, Math.floor(30_000 / cols.length)); // well under Postgres's 65535 parameters
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const values = chunk.map(row => `(${row.map(v => {
      params.push(v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);
      return `$${params.length}`;
    }).join(',')})`).join(',');
    const update = conflict
      ? ` ON CONFLICT (${conflict.key.join(',')}) DO UPDATE SET ${cols.filter(c => !conflict.key.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
      : '';
    await client.query(`INSERT INTO ${T(table)} (${cols.join(',')}) VALUES ${values}${update}`, params);
    n += chunk.length;
  }
  return n;
}
