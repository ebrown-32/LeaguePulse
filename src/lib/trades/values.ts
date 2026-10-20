/**
 * What every player is worth on the trade market, for this league's format: the value behind
 * Trade Finder's fairness grades (lib/trades/engine).
 *
 *   FantasyCalc     values from millions of real trades, by format (redraft or dynasty, one QB or
 *                   superflex, league size, PPR). GET /values/current, the only endpoint their
 *                   terms allow. Free with attribution under 1,000 monthly users: every page that
 *                   shows these values (or anything derived from them, like a fairness grade)
 *                   links to fantasycalc.com, in the server-rendered HTML. At 1,000 monthly users
 *                   or more, written permission first (fantasycalc.com, fantasycalcff@gmail.com).
 *                   Their terms also rule out using the values to build a trade calculator, so
 *                   Trade Finder only suggests trades; it never values a trade a user types in.
 *   DynastyProcess  the open values file on GitHub, when FantasyCalc is down: matched by name.
 *
 * Cached for six hours, shared by every league in the same format. FantasyCalc asks that the
 * values are refreshed at most once every three hours. Server only.
 */

import { getRedis } from '@/lib/redisClient';

export interface Format {
  dynasty: boolean;
  /** 2 for superflex or two-quarterback leagues. */
  numQbs: 1 | 2;
  numTeams: number;
  /** Points a reception: 0, 0.5 or 1. */
  ppr: 0 | 0.5 | 1;
}

export interface MarketValues {
  source: 'FantasyCalc' | 'DynastyProcess';
  /** By Sleeper player id. */
  byId: Record<string, number>;
  /** By name and position (nameKey), for players without a Sleeper id in the source. */
  byName: Record<string, number>;
  /** FantasyCalc's thirty-day trend by Sleeper id, where it has one. */
  trend: Record<string, number>;
  fetchedAt: number;
}

const TTL_S = 6 * 3600;
/** Never ask FantasyCalc again sooner than this, whatever the cache did. */
const MIN_REFRESH_MS = 3 * 3600_000;
const FC = 'https://api.fantasycalc.com/values/current';
const DP = 'https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv';

/** The league's format, from its Sleeper settings. */
export function formatOf(league: any): Format {
  const slots: string[] = league?.roster_positions ?? [];
  const qbs = slots.filter(s => s === 'QB').length;
  const rec = Number(league?.scoring_settings?.rec ?? 1);
  return {
    dynasty: Number(league?.settings?.type) === 2,
    numQbs: slots.includes('SUPER_FLEX') || qbs >= 2 ? 2 : 1,
    numTeams: Math.min(16, Math.max(6, Number(league?.total_rosters) || 10)),
    ppr: rec >= 0.75 ? 1 : rec >= 0.25 ? 0.5 : 0,
  };
}

export const nameKey = (name: string, position: string) =>
  `${name.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '')}|${position}`;

const keyOf = (f: Format) => `lp_fc_values:${f.dynasty ? 'd' : 'r'}${f.numQbs}q${f.numTeams}t${f.ppr}p`;
const memo = new Map<string, MarketValues>();

export async function marketValues(f: Format): Promise<MarketValues | null> {
  const key = keyOf(f);
  const mem = memo.get(key);
  if (mem && Date.now() - mem.fetchedAt < TTL_S * 1000) return mem;

  const redis = getRedis().client;
  const cached = await redis?.get(key).catch(() => null);
  if (cached) {
    try {
      const v = JSON.parse(cached) as MarketValues;
      memo.set(key, v);
      return v;
    } catch { /* fetch afresh */ }
  }
  // An in-process copy younger than three hours stands, even if the shared cache lost it.
  if (mem && Date.now() - mem.fetchedAt < MIN_REFRESH_MS) return mem;

  const fresh = (await fromFantasyCalc(f)) ?? (await fromDynastyProcess(f));
  if (!fresh) return mem ?? null;
  memo.set(key, fresh);
  await redis?.set(key, JSON.stringify(fresh), TTL_S).catch(() => {});
  return fresh;
}

async function fromFantasyCalc(f: Format): Promise<MarketValues | null> {
  const qs = new URLSearchParams({ isDynasty: String(f.dynasty), numQbs: String(f.numQbs), numTeams: String(f.numTeams), ppr: String(f.ppr) });
  try {
    const res = await fetch(`${FC}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const out: MarketValues = { source: 'FantasyCalc', byId: {}, byName: {}, trend: {}, fetchedAt: Date.now() };
    for (const r of rows) {
      const value = Number(r?.value);
      const p = r?.player;
      if (!p || !Number.isFinite(value)) continue;
      if (p.sleeperId) {
        out.byId[String(p.sleeperId)] = value;
        if (Number.isFinite(Number(r.trend30Day))) out.trend[String(p.sleeperId)] = Number(r.trend30Day);
      }
      if (p.name && p.position) out.byName[nameKey(p.name, p.position)] = value;
    }
    return out;
  } catch {
    return null;
  }
}

/** The open values file: one QB or superflex columns, dynasty leaning, by name. */
async function fromDynastyProcess(f: Format): Promise<MarketValues | null> {
  try {
    const res = await fetch(DP, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const lines = (await res.text()).trim().split('\n');
    const cols = parseCsvLine(lines[0]);
    const at = (c: string) => cols.indexOf(c);
    const [iName, iPos, iVal] = [at('player'), at('pos'), at(f.numQbs === 2 ? 'value_2qb' : 'value_1qb')];
    if (iName < 0 || iPos < 0 || iVal < 0) return null;
    const out: MarketValues = { source: 'DynastyProcess', byId: {}, byName: {}, trend: {}, fetchedAt: Date.now() };
    for (const line of lines.slice(1)) {
      const row = parseCsvLine(line);
      const value = Number(row[iVal]);
      if (row[iName] && row[iPos] && Number.isFinite(value)) out.byName[nameKey(row[iName], row[iPos])] = value;
    }
    return Object.keys(out.byName).length ? out : null;
  } catch {
    return null;
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
