/**
 * The field's view of every player, for The Edge's research (lib/edge/research): how many of the
 * leagues like this one roster and start him, week by week, who's adding and dropping him, what
 * he costs on waivers, and how often he's traded for. Read from the market's counts
 * (lib/market/crawl); the field is chosen the way lib/market/read chooses it: the league's own
 * format, widening until there are enough leagues. Null where the site has no market (a
 * self-hosted copy, or a market still warming up). Server only.
 */

import { ensureArchive, T } from '@/lib/archive/db';
import type { Market } from '@/lib/edge/metrics';
import { bidAt } from './aggregate';
import { comparisonLadder, formatOf } from './format';

const MIN_LEAGUES = 15;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export interface FieldPlayers { field: { label: string; leagues: number; week: number }; players: Map<string, Market> }

export async function fieldPlayers(league: { season: string | number } & Parameters<typeof formatOf>[0]): Promise<FieldPlayers | null> {
  const db = await ensureArchive().catch(() => null);
  if (!db) return null;
  const season = String(league.season);
  const f = formatOf(league);
  const { rows: fmtRows } = await db.query<{ fmt: string; week: number; leagues: number }>(`SELECT fmt, week, leagues FROM ${T('mkt_fmt_week')} WHERE season = $1`, [season]);
  const fmts = [...new Set(fmtRows.map(r => r.fmt))];
  let chosen: { label: string; fmts: string[]; week: number; byWeek: Map<number, number> } | null = null;
  for (const rung of comparisonLadder(f, fmts)) {
    if (!rung.fmts.length) continue;
    const byWeek = new Map<number, number>();
    for (const r of fmtRows) if (rung.fmts.includes(r.fmt)) byWeek.set(Number(r.week), (byWeek.get(Number(r.week)) ?? 0) + Number(r.leagues));
    const week = Math.max(0, ...[...byWeek].filter(([, n]) => n >= MIN_LEAGUES).map(([w]) => w));
    if (week) { chosen = { label: rung.label, fmts: rung.fmts, week, byWeek }; break; }
  }
  if (!chosen) return null;
  const { week, byWeek } = chosen;

  const [{ rows }, { rows: bidRows }] = await Promise.all([
    db.query<{ player_id: string; week: number; rostered: string; started: string; adds: string; drops: string; traded: string }>(
      `SELECT player_id, week, sum(rostered) AS rostered, sum(started) AS started, sum(adds) AS adds, sum(drops) AS drops, sum(traded_for) AS traded
       FROM ${T('mkt_player_week')} WHERE season = $1 AND fmt = ANY($2) AND week <= $3 GROUP BY player_id, week`,
      [season, chosen.fmts, week]),
    db.query<{ player_id: string; bids: number; bid_hist: number[] }>(
      `SELECT player_id, bids, bid_hist FROM ${T('mkt_player_week')} WHERE season = $1 AND fmt = ANY($2) AND week = $3 AND bids > 0`,
      [season, chosen.fmts, week]),
  ]);

  const bids = new Map<string, { n: number; hist: number[] }>();
  for (const r of bidRows) {
    const b = bids.get(r.player_id) ?? { n: 0, hist: [0, 0, 0, 0, 0, 0, 0] };
    b.n += Number(r.bids); (r.bid_hist ?? []).forEach((v, i) => { b.hist[i] += Number(v); });
    bids.set(r.player_id, b);
  }
  const leagues3 = [week - 2, week - 1, week].reduce((s, w) => s + (byWeek.get(w) ?? 0), 0) || 1;
  const players = new Map<string, Market & { _traded3: number }>();
  for (const r of rows.sort((a, b) => Number(a.week) - Number(b.week))) {
    const w = Number(r.week), L = byWeek.get(w) ?? 0;
    if (L < MIN_LEAGUES) continue;
    const m = players.get(r.player_id) ?? { rostered: 0, started: 0, adds: 0, drops: 0, bid50: null, bid75: null, traded: 0, trend: [], _traded3: 0 };
    m.trend.push({ w, r: pct(Number(r.rostered), L), s: pct(Number(r.started), L) });
    if (w >= week - 2) m._traded3 += Number(r.traded);
    if (w === week) {
      m.rostered = pct(Number(r.rostered), L); m.started = pct(Number(r.started), L);
      m.adds = pct(Number(r.adds), L); m.drops = pct(Number(r.drops), L);
      const b = bids.get(r.player_id);
      if (b && b.n >= 3) { m.bid50 = bidAt(b.hist, 0.5); m.bid75 = bidAt(b.hist, 0.75); }
    }
    players.set(r.player_id, m);
  }
  const out = new Map<string, Market>();
  for (const [id, { _traded3, ...m }] of players) out.set(id, { ...m, traded: Math.round((_traded3 / leagues3) * 1000) / 10 });
  return { field: { label: chosen.label, leagues: byWeek.get(week)!, week }, players: out };
}
