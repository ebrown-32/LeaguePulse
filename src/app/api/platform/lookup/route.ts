/**
 * Find someone's Sleeper leagues, for sign-up.
 *
 * Takes a Sleeper username or a league id. Sleeper's API is public and needs
 * no login, which is the whole reason sign-up can be "type your username":
 * nobody hands over a password, and nothing here can change their league.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNFLState } from '@/lib/api';
import { getRedis } from '@/lib/redisClient';
import { rateLimit, clientIp } from '@/lib/ai/rateLimit';

export const dynamic = 'force-dynamic';

const SLEEPER = 'https://api.sleeper.app/v1';
const FORMAT: Record<number, string> = { 0: 'Redraft', 1: 'Keeper', 2: 'Dynasty' };

export interface FoundLeague {
  leagueId: string;
  name: string;
  season: string;
  avatar: string | null;
  teams: number;
  format: string;
  scoring: string;
  status: string;
  /** Already has a hosted site, and where. */
  hostedAt: string | null;
}

async function json<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { next: { revalidate: 300 } }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

function describe(l: any, hostedAt: string | null): FoundLeague {
  const rec = Number(l.scoring_settings?.rec ?? 0);
  return {
    leagueId: String(l.league_id),
    name: String(l.name ?? 'League'),
    season: String(l.season ?? ''),
    avatar: l.avatar ?? null,
    teams: Number(l.total_rosters ?? 0),
    format: FORMAT[Number(l.settings?.type ?? 0)] ?? 'Redraft',
    scoring: rec >= 1 ? 'PPR' : rec >= 0.5 ? 'Half PPR' : 'Standard',
    status: String(l.status ?? ''),
    hostedAt,
  };
}

export async function GET(req: NextRequest) {
  // Two Sleeper calls a lookup; capped so this is not a free Sleeper proxy.
  const { ok } = await rateLimit('lp_lookup_rl_', clientIp(req), 60, 60 * 60 * 1000);
  if (!ok) return NextResponse.json({ error: 'Too many lookups. Try again in a bit.' }, { status: 429 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'Enter a Sleeper username or league ID' }, { status: 400 });

  const hosted = async (id: string) => {
    const r = getRedis().client;
    return r ? await r.get(`lp_tenant_league:${id}`).catch(() => null) : null;
  };

  // A league id: Sleeper's are long numbers.
  if (/^\d{15,22}$/.test(q)) {
    const l = await json<any>(`${SLEEPER}/league/${q}`);
    if (!l?.league_id) return NextResponse.json({ error: 'No Sleeper league with that ID' }, { status: 404 });
    if (l.sport && l.sport !== 'nfl') return NextResponse.json({ error: 'That is not an NFL league' }, { status: 400 });
    return NextResponse.json({ user: null, leagues: [describe(l, await hosted(l.league_id))] });
  }

  const user = await json<any>(`${SLEEPER}/user/${encodeURIComponent(q)}`);
  if (!user?.user_id) return NextResponse.json({ error: `No Sleeper user called "${q}"` }, { status: 404 });

  const state = await getNFLState().catch(() => null as any);
  const season = String(state?.league_season ?? state?.season ?? new Date().getFullYear());
  const leagues = (await json<any[]>(`${SLEEPER}/user/${user.user_id}/leagues/nfl/${season}`)) ?? [];
  const found = await Promise.all(leagues.map(async l => describe(l, await hosted(l.league_id))));

  return NextResponse.json({
    user: { userId: user.user_id, name: user.display_name ?? user.username, avatar: user.avatar ?? null },
    season,
    leagues: found.sort((a, b) => a.name.localeCompare(b.name)),
  });
}
