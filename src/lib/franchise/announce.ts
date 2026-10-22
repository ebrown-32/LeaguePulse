/**
 * A franchise's official account on The Feed: when its manager changes something worth telling
 * the league, the franchise posts about it, the way a team's social account would. A promotion
 * night gets its poster over the stadium; a new upgrade, a photo of it; a new stadium name, the
 * stadium; a ticket price change, a ticket.
 *
 *   promo     a promotion night at the next home game (Dollar Beer Night, fireworks, bobbleheads)
 *   build     a new facility, built
 *   prices    ticket prices changed enough to mention
 *   renamed   the stadium has a new name
 *   colors    the franchise's color changed
 *   motto     a new motto
 *   look      the stadium redressed in the Stadium Studio
 *   logo      a new midfield logo
 *
 * Posts are the franchise's own (personalityId franchise:<id>), at most one of a kind every so
 * often, so ten saves in the Stadium Studio are one announcement. Fails soft: a change is saved
 * whether or not its post goes out. Server only; call inside the league's request.
 */

import type { PhotoSpec, Shot } from './photo';
import type { PromoId } from '@/lib/tycoon/economy';
import type { TrackId } from '@/lib/tycoon/catalog';

export type Announcement =
  | { kind: 'promo'; promo: PromoId; score: number }
  | { kind: 'build'; track: TrackId; name: string; blurb: string }
  | { kind: 'prices'; ticket: number; was: number | null }
  | { kind: 'renamed'; stadiumName: string; was: string | null }
  | { kind: 'colors'; color: string }
  | { kind: 'motto'; motto: string }
  | { kind: 'look' }
  | { kind: 'logo'; url: string };

/** What the post shows under its text. */
export type OfficialVisual =
  | { type: 'photo'; photo: PhotoSpec }
  | { type: 'promo'; promo: PromoId; photo: PhotoSpec; when: string; opponent: string | null; color: string; stadium: string }
  | { type: 'ticket'; ticket: number; was: number | null; color: string; stadium: string; team: string; opponent: string | null; when: string }
  | { type: 'logo'; url: string; color: string; team: string }
  /** A player's big day (lib/franchise/gameday). */
  | { type: 'player'; playerId: string; name: string; position: string; nflTeam: string; points: number; line: string; color: string; team: string }
  /** A final score (lib/franchise/gameday). */
  | { type: 'final'; week: number; us: { name: string; score: number; color: string; avatar: string | null }; them: { name: string; score: number; color: string; avatar: string | null } }
  /** A league record that just fell (lib/ai/recordWatch): the new mark, and the one it beat. */
  | { type: 'record'; label: string; value: string; unit: string; holder: string; when: string; good: boolean; color: string;
      was: { value: string; holder: string; when: string } | null;
      player?: { id: string; name: string; position: string; nflTeam: string } };

/** How long after one announcement of a kind before the next can go out. */
const QUIET_MS: Record<Announcement['kind'], number> = {
  promo: 0, build: 15 * 60_000, prices: 6 * 3_600_000, renamed: 3_600_000, colors: 3_600_000,
  motto: 3_600_000, look: 6 * 3_600_000, logo: 3_600_000,
};

/** The shot that shows each upgrade off. */
const BUILD_SHOT: Record<TrackId, Shot> = {
  stadium: 'aerial', seating: 'crowd', concessions: 'exterior', restrooms: 'exterior', parking: 'drone',
  videoboard: 'crowd', suites: 'crowd', store: 'exterior', atmosphere: 'crowd',
};

const pick = <T,>(xs: T[], seed: number): T => xs[Math.abs(seed) % xs.length];

/** A handle the way teams pick them: the name run together, shortened to fit. */
export function handleOf(team: string): string {
  const words = team.replace(/[’']/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1));
  let h = words.join('');
  // Too long for a handle: first and last word, else the initials and the last word.
  if (h.length > 15 && words.length > 1) h = words[0] + words.at(-1);
  if (h.length > 15 && words.length > 1) h = words.slice(0, -1).map(w => w[0]).join('') + words.at(-1);
  return `@${h.slice(0, 15) || 'Team'}`;
}

/** The fan base's hashtag: the name's last word, or its initials when that's too plain. */
export function hashtagOf(team: string): string {
  const words = team.replace(/[’']/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const last = words.at(-1) ?? 'Team';
  const tag = last.length >= 5 ? `${last[0].toUpperCase()}${last.slice(1)}Nation` : words.map(w => w[0].toUpperCase()).join('') + 'Nation';
  return `#${tag}`;
}

const PROMO_COPY: Record<PromoId, ((o: { stadium: string; opponent: string | null; when: string; tag: string; hype: boolean }) => string)[]> = {
  beer: [
    o => `DOLLAR BEER NIGHT\n\n${o.when}${o.opponent ? ` vs. ${o.opponent}` : ''}. Every beer at ${o.stadium} is $1 all game long. Yes, all of them.\n\nPlease hydrate responsibly. ${o.tag}`,
    o => `We checked with legal and we are doing it anyway: $1 beers at ${o.stadium} ${o.when.toLowerCase()}.\n\nGates open early. ${o.hype ? 'We ordered extra. A LOT extra.' : 'Come thirsty.'} ${o.tag}`,
    o => `Cheapest beer in the league, loudest building in the league. One night only.\n\n$1 BEER NIGHT · ${o.when}${o.opponent ? ` · vs. ${o.opponent}` : ''} ${o.tag}`,
  ],
  fireworks: [
    o => `Stay after the final whistle ${o.when.toLowerCase()}. We're lighting up the sky over ${o.stadium}.\n\nFireworks Night${o.opponent ? ` vs. ${o.opponent}` : ''}. Bring the whole family. ${o.tag}`,
    o => `Win or lose, the sky is going to look incredible. Fireworks Night at ${o.stadium}, ${o.when.toLowerCase()}. ${o.tag}`,
  ],
  bobblehead: [
    o => `FREE BOBBLEHEAD\n\nThe first 10,000 fans through the gates at ${o.stadium} ${o.when.toLowerCase()} take one home. He nods. He knows. ${o.tag}`,
    o => `Our bobbleheads have arrived and frankly they look better than our offensive line. First 10,000 fans${o.opponent ? ` vs. ${o.opponent}` : ''}, ${o.when.toLowerCase()}. ${o.tag}`,
  ],
};

function copy(a: Announcement, o: { team: string; stadium: string; tag: string; opponent: string | null; when: string; seed: number }): string {
  switch (a.kind) {
    case 'promo':
      return pick(PROMO_COPY[a.promo], o.seed)({ stadium: o.stadium, opponent: o.opponent, when: o.when, tag: o.tag, hype: a.score >= 4 });
    case 'build':
      return pick([
        `It's official. ${a.name} is open at ${o.stadium}.\n\n${a.blurb} ${o.tag}`,
        `New at ${o.stadium}: ${a.name}. ${a.blurb}\n\nCome see it for yourself. ${o.tag}`,
        `Ribbon cut. ${a.name} is ready for game day. ${o.tag}`,
      ], o.seed);
    case 'prices': {
      const down = a.was != null && a.ticket < a.was;
      return down
        ? `Lowering ticket prices to $${a.ticket} for our next home game. Football should be for everybody. See you at ${o.stadium}. ${o.tag}`
        : `Tickets for our next home game at ${o.stadium} are $${a.ticket}. Limited availability. Get yours before your group chat does. ${o.tag}`;
    }
    case 'renamed':
      return pick([
        `Welcome to ${a.stadiumName}.\n\n${a.was ? `${a.was} served us well. ` : ''}A new chapter starts here. ${o.tag}`,
        `Same address. New name. ${a.stadiumName} is home. ${o.tag}`,
      ], o.seed);
    case 'colors':
      return `New season, new colors. Wear them loud. ${o.tag}`;
    case 'motto':
      return `“${a.motto}”\n\nThat's who we are. ${o.tag}`;
    case 'look':
      return pick([
        `Fresh look at ${o.stadium}. The crews worked overnight. Thoughts? ${o.tag}`,
        `${o.stadium} has never looked better. ${o.tag}`,
      ], o.seed);
    case 'logo':
      return `Meet the new logo. You'll see it at midfield on game day. ${o.tag}`;
  }
}

/** The franchise's next home game: when, and against whom (this week's game if it hosts, else next week's). */
async function nextHomeGame(franchiseId: string): Promise<{ when: string; opponent: string | null; week: number; season: string }> {
  const [{ getCurrentLeagueId }, api, { venueFor }] = await Promise.all([
    import('@/config/league'), import('@/lib/api'), import('./venueServer'),
  ]);
  const [leagueId, nfl] = await Promise.all([getCurrentLeagueId(), api.getNFLState().catch(() => null as any)]);
  const season = String(nfl?.season ?? new Date().getFullYear());
  const week = Math.max(1, Number(nfl?.week ?? 1));
  try {
    const [rosters, users] = await Promise.all([api.getLeagueRosters(leagueId), api.getLeagueUsers(leagueId)]);
    const mine = rosters.find((r: any) => String(r.owner_id) === franchiseId);
    const nameOf = (id: string) => { const u = (users as any[]).find(x => String(x.user_id) === id); return u?.metadata?.team_name || u?.display_name || null; };
    for (const w of [week, week + 1]) {
      const games = await api.getLeagueMatchups(leagueId, w).catch(() => [] as any[]);
      const me = games.find((m: any) => m.roster_id === mine?.roster_id);
      const them = me?.matchup_id != null ? games.find((m: any) => m.matchup_id === me.matchup_id && m.roster_id !== me.roster_id) : null;
      const oppId = them ? String(rosters.find((r: any) => r.roster_id === them.roster_id)?.owner_id ?? '') : '';
      if (!oppId) continue;
      const v = await venueFor(franchiseId, oppId, w).catch(() => null);
      if (v?.host === franchiseId) return { when: w === week ? 'This Sunday' : 'Next Sunday', opponent: nameOf(oppId), week: w, season };
    }
  } catch { /* said without the opponent */ }
  return { when: 'Our next home game', opponent: null, week, season };
}

/** Who a franchise's account is: its name, picture, color, stadium and hashtag. */
export interface Face { franchiseId: string; team: string; avatar: string; color: string; stadium: string; tag: string }

export async function faceOf(franchiseId: string): Promise<Face> {
  const [{ currentSite }, store, { franchiseInfo }, { getTenant }, { defaultStadiumName }] = await Promise.all([
    import('@/lib/archive/ingest'), import('./store'), import('./lookup'), import('@/lib/platform/tenants'), import('./stadiumName'),
  ]);
  const site = await currentSite();
  const tenant = site === 'self' ? null : await getTenant(site);
  const [f, info] = await Promise.all([
    store.getFranchise(site, franchiseId),
    tenant ? franchiseInfo(tenant, franchiseId).catch(() => null) : Promise.resolve(null),
  ]);
  const team = info?.teamName ?? 'The franchise';
  return {
    franchiseId, team, color: f.color || '#2a78d6', stadium: f.stadiumName || defaultStadiumName(franchiseId, team), tag: hashtagOf(team),
    // The team's own picture from its league (an uploaded logo is for the stadium's midfield).
    avatar: info?.avatar || `/api/franchises/${encodeURIComponent(franchiseId)}/logo`,
  };
}

/** A post on The Feed from the franchise's own account. */
export async function postAs(face: Face, o: { text: string; visual: OfficialVisual | null; event: string; publishAt?: number }): Promise<void> {
  const now = Date.now();
  const { addPost } = await import('@/lib/ai/store');
  await addPost({
    id: `official-${face.franchiseId}-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    personalityId: `franchise:${face.franchiseId}`,
    personaName: face.team, personaHandle: handleOf(face.team), personaAccent: 'text-foreground', personaType: 'team',
    personaAvatar: face.avatar,
    kind: 'official',
    content: { text: o.text, visual: o.visual, event: o.event, hostTeam: face.team },
    createdAt: new Date(now).toISOString(), publishAt: new Date(o.publishAt ?? now).toISOString(), source: 'admin', subject: face.team,
  });
}

export async function announce(franchiseId: string, a: Announcement): Promise<void> {
  try {
    const { getRedis } = await import('@/lib/redisClient');
    const redis = getRedis().client;
    if (!redis) return;
    const quietKey = `franchise_announced:${franchiseId}:${a.kind}`;
    if (QUIET_MS[a.kind] && await redis.get(quietKey)) return;

    const face = await faceOf(franchiseId);
    const { team, stadium, color, tag } = face;
    const game = await nextHomeGame(franchiseId);
    const seed = Math.floor(Date.now() / 1000) + franchiseId.length;

    const photo = (shot: Shot, hour: number, full = 0): PhotoSpec => ({
      shot, host: franchiseId, guest: franchiseId, season: game.season, week: game.week, hour, stands: full, lots: full,
    });
    const visual: OfficialVisual | null =
      a.kind === 'promo'
        ? { type: 'promo', promo: a.promo, when: game.when, opponent: game.opponent, color, stadium,
            // Beer night from the tailgates in the lots (among the tents, or the drone over them),
            // fireworks over the bowl after dark, bobbleheads at the gates.
            photo: a.promo === 'fireworks' ? photo('aerial', 21.5, 0.95)
              : a.promo === 'beer' ? photo(seed % 2 ? 'tailgate' : 'drone', 15.5, 0.95)
              : photo('exterior', 16.5, 0.8) }
      : a.kind === 'build' ? { type: 'photo', photo: photo(BUILD_SHOT[a.track], 15, a.track === 'parking' ? 0.7 : 0) }
      : a.kind === 'prices' ? { type: 'ticket', ticket: a.ticket, was: a.was, color, stadium, team, opponent: game.opponent, when: game.when }
      : a.kind === 'renamed' || a.kind === 'colors' ? { type: 'photo', photo: photo('exterior', 19.5, 0) }
      : a.kind === 'look' ? { type: 'photo', photo: photo('aerial', 17.5, 0) }
      : a.kind === 'logo' ? { type: 'logo', url: a.url, color, team }
      : null;

    await postAs(face, { text: copy(a, { team, stadium, tag, opponent: game.opponent, when: game.when, seed }), visual, event: a.kind });
    if (QUIET_MS[a.kind]) await redis.set(quietKey, '1', Math.ceil(QUIET_MS[a.kind] / 1000));
  } catch (err) {
    console.error('[franchise/announce]', a.kind, err instanceof Error ? err.message : err);
  }
}
