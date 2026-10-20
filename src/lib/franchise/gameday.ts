/**
 * The franchises' accounts on game day (see announce.ts): when a starter has a big game, his
 * team says so, with his line; when a matchup is over, both teams post the final.
 *
 *   A highlight waits until the player's NFL game is over (and a quarter hour more, for the
 *   provider's points to settle), and goes out for a big day at his position. At most two a
 *   week for a franchise: its best.
 *   A final waits until every starter on both sides is done (and twenty minutes more), then each
 *   team posts it, the winner first.
 *
 * Each post is remembered, so the job can run every few minutes and never says a thing twice.
 * Server only; call inside the league's request (franchise/cron).
 */

import type { LiveGame } from '@/lib/live/espn';
import { faceOf, postAs, type Face } from './announce.ts';

/** A big day, by position: points in the league's own scoring. */
const BIG: Record<string, number> = { QB: 28, RB: 25, WR: 25, TE: 22, K: 15, DEF: 15 };
const SETTLE_MS = 15 * 60_000, FINAL_SETTLE_MS = 20 * 60_000;
const KEEP_S = 21 * 86_400;
const PER_WEEK = 2;

const pick = <T,>(xs: T[], seed: number): T => xs[Math.abs(seed) % xs.length];
const seedOf = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const pts = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** The week's real stats, to quote a player's line: fetched once every ten minutes, for every league. */
const statsMemo = new Map<string, { at: number; value: Promise<Record<string, Record<string, number>>> }>();
function weekStats(season: string, week: number) {
  const key = `${season}:${week}`, hit = statsMemo.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  type Stats = Record<string, Record<string, number>>;
  const value: Promise<Stats> = fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    .then(r => (r.ok ? r.json() as Promise<Stats> : {})).catch(() => ({}));
  statsMemo.set(key, { at: Date.now(), value });
  return value;
}

/** A box score line, the way a team account would write it. */
export function statLine(position: string, s: Record<string, number> | undefined): string {
  if (!s) return '';
  const n = (k: string) => Math.round(Number(s[k] ?? 0));
  const parts: string[] = [];
  const td = (k: string) => (n(k) ? `${n(k)} TD` : '');
  switch (position) {
    case 'QB':
      parts.push(`${n('pass_cmp')}/${n('pass_att')}, ${n('pass_yd')} yds`, td('pass_td'));
      if (n('pass_int')) parts.push(`${n('pass_int')} INT`);
      if (n('rush_yd') >= 20 || n('rush_td')) parts.push(`${n('rush_yd')} rush yds${n('rush_td') ? `, ${n('rush_td')} rush TD` : ''}`);
      break;
    case 'RB':
      parts.push(`${n('rush_att')} car, ${n('rush_yd')} yds`, td('rush_td'));
      if (n('rec')) parts.push(`${n('rec')} rec, ${n('rec_yd')} yds${n('rec_td') ? `, ${n('rec_td')} TD` : ''}`);
      break;
    case 'WR': case 'TE':
      parts.push(`${n('rec')} rec, ${n('rec_yd')} yds`, td('rec_td'));
      break;
    case 'K':
      parts.push(`${n('fgm')}/${n('fga')} FG`, n('xpm') ? `${n('xpm')} XP` : '');
      break;
    case 'DEF':
      parts.push(n('sack') ? `${n('sack')} sacks` : '', n('int') ? `${n('int')} INT` : '', n('fum_rec') ? `${n('fum_rec')} FR` : '', n('def_td') ? `${n('def_td')} TD` : '');
      break;
  }
  return parts.filter(Boolean).join(', ');
}

function highlightText(o: { name: string; last: string; line: string; points: number; team: string; tag: string; seed: number }): string {
  return pick([
    `${o.name} went OFF today.\n\n${o.line}. ${pts(o.points)} fantasy points. ${o.tag}`,
    `Put some respect on ${o.last}'s name.\n\n${o.line}. ${pts(o.points)} points. ${o.tag}`,
    `${pts(o.points)} points from ${o.name}. That's the tweet. ${o.tag}`,
    `${o.last} cooking. ${o.line}. ${o.tag}`,
  ], o.seed);
}

function finalText(o: { us: string; them: string; a: number; b: number; won: boolean; tie: boolean; star: string | null; starPts: number; tag: string; seed: number }): string {
  const score = `${pts(o.a)}-${pts(o.b)}`;
  const margin = Math.abs(o.a - o.b);
  if (o.tie) return `FINAL: ${o.us} ${pts(o.a)}, ${o.them} ${pts(o.b)}. A tie. Nobody is happy. ${o.tag}`;
  if (o.won) {
    if (margin >= 35) return pick([`FINAL: ${o.us} ${pts(o.a)}, ${o.them} ${pts(o.b)}.\n\nThat was never close. ${o.tag}`, `FINAL. ${score}. Statement made. ${o.tag}`], o.seed);
    if (margin < 5) return pick([`FINAL. ${score}. Heart rates are returning to normal. W. ${o.tag}`, `We like to keep it interesting. FINAL: ${score} over ${o.them}. ${o.tag}`], o.seed);
    return pick([
      `FINAL: ${o.us} ${pts(o.a)}, ${o.them} ${pts(o.b)}.${o.star ? ` ${o.star} led the way with ${pts(o.starPts)}.` : ''} ${o.tag}`,
      `W. ${score} over ${o.them}. ${o.tag}`,
    ], o.seed);
  }
  if (margin >= 35) return pick([`FINAL. We don't want to talk about it. On to next week. ${o.tag}`, `FINAL: ${o.them} ${pts(o.b)}, ${o.us} ${pts(o.a)}. Burn the tape. ${o.tag}`], o.seed);
  if (margin < 5) return pick([`FINAL: ${o.them} ${pts(o.b)}, ${o.us} ${pts(o.a)}. We'll be thinking about that one for a while. ${o.tag}`, `${pts(margin)} points. That's all it was. FINAL: ${pts(o.a)}-${pts(o.b)}. ${o.tag}`], o.seed);
  return pick([`FINAL: ${o.them} ${pts(o.b)}, ${o.us} ${pts(o.a)}. Back to work. ${o.tag}`, `Not our day. FINAL: ${pts(o.a)}-${pts(o.b)}. ${o.tag}`], o.seed);
}

export interface GamedayResult { highlights: number; finals: number }

export async function gamedayPosts(games: LiveGame[]): Promise<GamedayResult> {
  const out: GamedayResult = { highlights: 0, finals: 0 };
  const [{ getRedis }, api, { getCurrentLeagueId }, { getPlayersDirectory }, { espnTeam }] = await Promise.all([
    import('@/lib/redisClient'), import('@/lib/api'), import('@/config/league'), import('@/lib/playerStats'), import('@/lib/live/espn'),
  ]);
  const redis = getRedis().client;
  if (!redis) return out;
  const nfl = await api.getNFLState().catch(() => null as any);
  if (!nfl || !['regular', 'post'].includes(String(nfl.season_type))) return out;
  const season = String(nfl.season), week = Number(nfl.week);
  const leagueId = await getCurrentLeagueId();
  const [matchups, rosters, directory, stats] = await Promise.all([
    api.getLeagueMatchups(leagueId, week).catch(() => [] as any[]),
    api.getLeagueRosters(leagueId).catch(() => [] as any[]),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
    weekStats(season, week),
  ]);
  if (!matchups.length) return out;

  const byTeam = new Map<string, LiveGame>();
  for (const g of games) { byTeam.set(g.home.abbr, g); byTeam.set(g.away.abbr, g); }
  /** Where a player's NFL game is: over, on, still to come, or none this week. */
  const stateOf = (pid: string): 'post' | 'in' | 'pre' | 'bye' => {
    const p = directory[pid];
    const team = String(p?.team ?? (/^[A-Z]{2,3}$/.test(pid) ? pid : ''));
    const g = byTeam.get(espnTeam(team) ?? '');
    return g ? (g.state as 'post' | 'in' | 'pre') : 'bye';
  };
  const ownerOf = (rid: number) => String(rosters.find((r: any) => r.roster_id === rid)?.owner_id ?? '');
  const now = Date.now();
  const k = (s: string) => `franchise_gameday:${leagueId}:${season}:${week}:${s}`;
  /** When this was first seen settled, remembered: whether it has been long enough since. */
  const settledFor = async (key: string, ms: number) => {
    const at = Number(await redis.get(k(`seen:${key}`)).catch(() => null));
    if (!at) { await redis.set(k(`seen:${key}`), String(now), KEEP_S).catch(() => {}); return false; }
    return now - at >= ms;
  };
  const faces = new Map<string, Promise<Face>>();
  const face = (id: string) => { if (!faces.has(id)) faces.set(id, faceOf(id)); return faces.get(id)!; };

  // ── Big days.
  for (const m of matchups) {
    const fid = ownerOf(m.roster_id);
    if (!fid) continue;
    const starters = ((m.starters ?? []) as string[]).filter(id => id && id !== '0');
    const big = starters
      .map(pid => ({ pid, points: Number(m.players_points?.[pid] ?? 0), pos: String(directory[pid]?.position ?? (/^[A-Z]{2,3}$/.test(pid) ? 'DEF' : '')) }))
      .filter(x => BIG[x.pos] != null && x.points >= BIG[x.pos])
      .sort((a, b) => b.points - a.points);
    for (const x of big) {
      if (stateOf(x.pid) !== 'post') continue;
      if (await redis.get(k(`hl:${fid}:${x.pid}`))) continue;
      const count = Number(await redis.get(k(`hlcount:${fid}`)) ?? 0);
      if (count >= PER_WEEK) break;
      if (!(await settledFor(`p:${x.pid}`, SETTLE_MS))) continue;
      const p = directory[x.pid] ?? {};
      const name = x.pos === 'DEF' ? `The ${x.pid} defense` : (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || x.pid);
      const last = x.pos === 'DEF' ? `the ${x.pid} D` : (p.last_name || name);
      const line = statLine(x.pos, stats[x.pid]);
      const f = await face(fid);
      await postAs(f, {
        text: highlightText({ name, last, line: line || `${pts(x.points)} points`, points: x.points, team: f.team, tag: f.tag, seed: seedOf(`${week}`) + out.highlights }), // the league's posts this run take turns through the lines
        visual: { type: 'player', playerId: x.pid, name, position: x.pos, nflTeam: String(p.team ?? x.pid), points: x.points, line, color: f.color, team: f.team },
        event: 'highlight',
      });
      await redis.set(k(`hl:${fid}:${x.pid}`), '1', KEEP_S);
      await redis.set(k(`hlcount:${fid}`), String(count + 1), KEEP_S);
      out.highlights++;
    }
  }

  // ── Finals.
  const pairs = new Map<number, any[]>();
  for (const m of matchups) if (m.matchup_id != null) pairs.set(m.matchup_id, [...(pairs.get(m.matchup_id) ?? []), m]);
  for (const [mid, pair] of pairs) {
    if (pair.length !== 2) continue;
    if (await redis.get(k(`final:${mid}`))) continue;
    const everyone = pair.flatMap(m => ((m.starters ?? []) as string[]).filter(id => id && id !== '0'));
    const states = everyone.map(stateOf);
    if (states.some(s => s === 'pre' || s === 'in') || !states.includes('post')) continue;
    if (!(await settledFor(`m:${mid}`, FINAL_SETTLE_MS))) continue;
    const score = (m: any) => Number(m.custom_points ?? m.points ?? 0);
    const [x, y] = [...pair].sort((a, b) => score(b) - score(a));
    const tie = score(x) === score(y);
    const [fx, fy] = await Promise.all([face(ownerOf(x.roster_id)), face(ownerOf(y.roster_id))]);
    const star = (m: any) => {
      const best = ((m.starters ?? []) as string[]).filter(id => id && id !== '0').map(pid => [pid, Number(m.players_points?.[pid] ?? 0)] as const).sort((a, b) => b[1] - a[1])[0];
      const p = best ? directory[best[0]] : null;
      return best ? { name: p?.full_name || (p ? `${p.first_name} ${p.last_name}` : best[0]), pts: best[1] } : null;
    };
    // The winner first, the loser a few minutes later, as accounts do.
    for (const [i, [me, them, mf, tf]] of ([[x, y, fx, fy], [y, x, fy, fx]] as const).entries()) {
      const s = star(me);
      await postAs(mf, {
        text: finalText({ us: mf.team, them: tf.team, a: score(me), b: score(them), won: i === 0 && !tie, tie, star: s?.name ?? null, starPts: s?.pts ?? 0, tag: mf.tag, seed: seedOf(`${mf.franchiseId}${week}`) }),
        visual: {
          type: 'final', week,
          us: { name: mf.team, score: score(me), color: mf.color, avatar: mf.avatar },
          them: { name: tf.team, score: score(them), color: tf.color, avatar: tf.avatar },
        },
        event: 'final', publishAt: now + i * 4 * 60_000,
      });
      out.finals++;
    }
    await redis.set(k(`final:${mid}`), '1', KEEP_S);
  }
  return out;
}
