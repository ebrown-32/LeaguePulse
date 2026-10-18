/**
 * One fantasy matchup, live (lib/live/liveTypes): Sleeper for the lineups and
 * the fantasy points, ESPN's scoreboard for where each starter's NFL game is
 * (who has the ball, how far out), ESPN's play by play for the plays.
 *
 * Everything fails soft, as the watch guide does (lib/live/espn): a broken
 * ESPN feed leaves the starters on the sideline with their points, never an
 * error. Server only.
 */

import { getLeagueMatchups, getLeagueRosters, getLeagueUsers, getNFLState } from '@/lib/api';
import { getPlayersDirectory } from '@/lib/playerStats';
import { espnScoreboard, espnTeam, type LiveGame } from './espn';
import { playFeed } from './playFeed';
import type { LiveMatchup, LivePlay, LivePlayer, LiveState } from './liveTypes';
import { KICKER_RANGE, OFFENSE, kickoff, placeOf } from './place';

/** What the stadium draws for a play, from its type and the player's part in it. */
export function playKind(type: string, role: string): LivePlay['kind'] {
  const t = type.toLowerCase();
  if (/pass reception|passing touchdown/.test(t)) return role === 'receiver' || role === 'scorer' ? 'catch' : role === 'passer' ? 'throw' : 'other';
  if (/^rush|rushing/.test(t) && (role === 'rusher' || role === 'scorer')) return 'run';
  return 'other';
}

export async function liveMatchup(o: {
  leagueId: string; week: number; host: string; guest: string; scoring: Record<string, number>;
}): Promise<LiveMatchup | null> {
  const [nfl, rosters, users, matchups, directory] = await Promise.all([
    getNFLState().catch(() => null as any), getLeagueRosters(o.leagueId), getLeagueUsers(o.leagueId).catch(() => [] as any[]),
    getLeagueMatchups(o.leagueId, o.week).catch(() => [] as any[]), getPlayersDirectory(),
  ]);
  const rosterOf = (userId: string) => rosters.find((r: any) => String(r.owner_id) === userId);
  const hostR = rosterOf(o.host), guestR = rosterOf(o.guest);
  if (!hostR || !guestR) return null;
  const rowOf = (rosterId: number) => (matchups as any[]).find(m => m.roster_id === rosterId) ?? null;
  const hostM = rowOf(hostR.roster_id), guestM = rowOf(guestR.roster_id);
  const nameOf = (userId: string) => {
    const u = (users as any[]).find(x => String(x.user_id) === userId);
    return u?.metadata?.team_name || u?.display_name || 'Team';
  };

  // The scoreboard is this NFL week's; a past week is final, a future one hasn't started.
  const nflWeek = Number(nfl?.week ?? 0);
  const gameWeek = o.week === nflWeek, past = o.week < nflWeek;
  const games = gameWeek ? await espnScoreboard().catch(() => [] as LiveGame[]) : [];
  const byTeam = new Map<string, LiveGame>();
  for (const g of games) { byTeam.set(g.home.abbr, g); byTeam.set(g.away.abbr, g); }

  const starters = (m: any) => ((m?.starters ?? []) as string[]).filter(id => id && id !== '0');
  const players: LivePlayer[] = [];
  for (const [side, m] of [['host', hostM], ['guest', guestM]] as const) {
    for (const id of starters(m)) {
      const p = directory[id] ?? {};
      const position = String(p.position ?? (/^[A-Z]{2,3}$/.test(id) ? 'DEF' : ''));
      const nflTeam = String(p.team ?? (position === 'DEF' ? id : ''));
      const espn = espnTeam(nflTeam) ?? '';
      players.push({
        playerId: id,
        name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || (position === 'DEF' ? `${nflTeam} Defense` : id),
        position, nflTeam, side,
        points: typeof m?.players_points?.[id] === 'number' ? m.players_points[id] : null,
        ...placeOf(position, espn, byTeam.get(espn), gameWeek, past),
        channel: byTeam.get(espn)?.broadcast ?? null,
        when: (() => { const g = byTeam.get(espn); return !g ? null : g.state === 'pre' ? kickoff(g.kickoff) : g.state === 'in' ? g.detail : null; })(),
      });
    }
  }

  const started = games.some(g => g.state !== 'pre');
  const allDone = games.length > 0 && games.every(g => g.state === 'post');
  const phase: LiveMatchup['phase'] = past || (gameWeek && allDone) ? 'final' : gameWeek && started ? 'live' : 'upcoming';

  // The plays, for both lineups, once anything has been played.
  let plays: LivePlay[] = [];
  if (gameWeek && started) {
    const feed = await playFeed({
      mine: starters(hostM), theirs: starters(guestM), scoring: o.scoring, limit: 30,
    }).catch(() => []);
    plays = feed.map(f => ({
      id: f.id, playerId: f.playerId, side: f.side === 'mine' ? 'host' : 'guest', text: f.text, points: f.points,
      scoring: f.scoring, big: f.scoring || (f.points ?? 0) >= 4, at: f.at, period: f.period, clock: f.clock,
      kind: playKind(f.type, f.role), yards: f.yards,
    }));
  }

  const score = (m: any) => Math.round(Number(m?.custom_points ?? m?.points ?? 0) * 100) / 100;
  return {
    week: o.week, phase,
    host: { userId: o.host, name: nameOf(o.host), score: score(hostM) },
    guest: { userId: o.guest, name: nameOf(o.guest), score: score(guestM) },
    players, plays, updatedAt: Date.now(),
  };
}

/**
 * A made-up game, for building and checking the live stadium on a development
 * server when no NFL game is on. The real lineups and names, with everything
 * else simulated on a clock (so polling sees drives move and plays land):
 * never served in production, and marked `demo` so the stadium says DEMO.
 */
export function demoize(real: LiveMatchup, now = Date.now()): LiveMatchup {
  const tick = Math.floor(now / 15_000);
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const teams = [...new Set(real.players.map(p => p.nflTeam))];
  // Each NFL team is on a drive that lasts a few minutes, its ball creeping downfield.
  const drive = (team: string) => {
    const h = hash(team), len = 8 + (h % 9), t = (tick + (h % 13)) % (len * 2);
    if (t >= len) return null;
    return Math.max(1, 80 - Math.round((t / len) * 82) + (h % 7));
  };
  const players = real.players.map(p => {
    const togo = drive(p.nflTeam), oppTogo = drive(teams[(teams.indexOf(p.nflTeam) + 1) % teams.length]);
    const driving = togo != null && (OFFENSE.has(p.position) || (p.position === 'K' && togo <= KICKER_RANGE));
    const defending = p.position === 'DEF' && togo == null && oppTogo != null;
    const y = driving ? togo : defending ? oppTogo : null;
    const base = (p.points ?? 0) + (hash(p.playerId) % 90) / 10 + (tick % 40) * 0.12;
    return {
      ...p, points: Math.round(base * 10) / 10,
      state: (driving ? 'driving' : defending ? 'defending' : 'sideline') as LiveState,
      yardsToEndzone: y, redZone: y != null && y <= 20,
      downDistance: y != null ? `${['1st', '2nd', '3rd'][tick % 3]} & ${1 + (hash(p.nflTeam + tick) % 10)}` : null,
      game: `${p.nflTeam} · Q${1 + (Math.floor(tick / 30) % 4)} (demo)`,
      channel: p.channel ?? ['CBS', 'FOX', 'NBC', 'ESPN', 'Prime Video'][hash(p.nflTeam) % 5],
      when: `Q${1 + (Math.floor(tick / 30) % 4)} ${7 + (tick % 8)}:${String((tick * 7) % 60).padStart(2, '0')}`,
    };
  });
  // A play every tick for one of the drivers; every fourth a touchdown.
  const drivers = players.filter(p => p.state === 'driving');
  const plays: LivePlay[] = Array.from({ length: 6 }, (_, k) => {
    const t = tick - k, p = drivers[(t >>> 0) % Math.max(1, drivers.length)] ?? players[0];
    const td = t % 4 === 0, yards = 6 + (hash(String(t)) % 30);
    const kind: LivePlay['kind'] = p.position === 'QB' ? 'throw' : p.position === 'RB' && t % 2 === 0 ? 'run' : 'catch';
    return {
      id: `demo-${t}`, playerId: p.playerId, side: p.side,
      text: td ? `${p.name} touchdown (demo play)` : `${p.name} ${kind === 'run' ? 'runs' : kind === 'throw' ? 'throws' : 'catches'} for ${yards} yards (demo play)`,
      points: td ? 6 + yards / 10 : yards / 10, scoring: td, big: td || yards >= 20, at: new Date(t * 15_000).toISOString(), period: 2, clock: '7:00',
      kind, yards,
    };
  });
  const total = (side: 'host' | 'guest') => Math.round(players.filter(p => p.side === side).reduce((s, p) => s + (p.points ?? 0), 0) * 100) / 100;
  return { ...real, phase: 'live', players, plays, host: { ...real.host, score: total('host') }, guest: { ...real.guest, score: total('guest') }, demo: true, updatedAt: now };
}
