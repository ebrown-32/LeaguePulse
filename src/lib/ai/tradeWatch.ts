/**
 * The media desk covers every trade as it happens: within a quarter hour of a deal going through,
 * a writer grades it (lib/ai/generate gradeTrade: who won, a grade and reasoning for each side, in
 * their own voice) and another fires back in the replies. Checked by the franchise job every
 * fifteen minutes, all year (api/franchise/cron).
 *
 * Trades are rare and the thing a league talks about most, so they skip the desk's daily caps
 * (lib/ai/deskVolume); a desk that's off stays off. The first look at a league remembers the
 * trades it already has rather than grading its history all at once. Server only; call inside
 * the league's request.
 */

import type { Personality } from './personalities';
import type { FeedPost } from './store';

/** Trades graded per league per run: the rest wait a quarter hour. */
const PER_RUN = 2;
/** Older than this when first seen: history, not news. */
const FRESH_MS = 2 * 86_400_000;
const KEEP = 300;
const SEEN = 'ai_trades_covered';
const LOCK = (id: string) => `ai_trade_grading:${id}`;

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export async function coverNewTrades(): Promise<{ graded: number; skipped?: string }> {
  const [{ getRedis }, { isAIConfigured }, { getDeskVolume }] = await Promise.all([
    import('@/lib/redisClient'), import('./claude'), import('./deskVolume'),
  ]);
  const redis = getRedis().client;
  if (!redis) return { graded: 0, skipped: 'no-storage' };
  if (!(await isAIConfigured())) return { graded: 0, skipped: 'ai-not-configured' };
  if ((await getDeskVolume()) === 'off') return { graded: 0, skipped: 'desk-off' };

  const [api, { getCurrentLeagueId }, { getPlayersDirectory }] = await Promise.all([
    import('@/lib/api'), import('@/config/league'), import('@/lib/playerStats'),
  ]);
  const [nfl, leagueId] = await Promise.all([api.getNFLState().catch(() => null as any), getCurrentLeagueId()]);
  const week = Math.max(1, Number(nfl?.week ?? 1));
  const weeks = [...new Set([week, Math.max(1, week - 1)])];
  const trades = (await Promise.all(weeks.map(w => api.getLeagueTransactions(leagueId, w).catch(() => []))))
    .flat().filter((t: any) => t?.type === 'trade' && t.status === 'complete' && t.transaction_id)
    .sort((a: any, b: any) => Number(a.status_updated ?? a.created ?? 0) - Number(b.status_updated ?? b.created ?? 0));

  const raw = await redis.get(SEEN).catch(() => null);
  const firstLook = raw === null;
  let seen: string[] = [];
  try { seen = raw ? JSON.parse(raw) : []; } catch { /* starts afresh */ }
  const remember = async (ids: string[]) => {
    seen = [...seen, ...ids].slice(-KEEP);
    await redis.set(SEEN, JSON.stringify(seen));
  };
  const at = (t: any) => Number(t.status_updated ?? t.created ?? 0);
  const fresh = trades.filter((t: any) => !seen.includes(String(t.transaction_id)));
  // The first look: anything older than a couple of days is history; remember it unread.
  const stale = fresh.filter((t: any) => firstLook || Date.now() - at(t) > FRESH_MS);
  if (stale.length) await remember(stale.map((t: any) => String(t.transaction_id)));
  const news = fresh.filter((t: any) => !stale.includes(t)).slice(0, PER_RUN);
  if (!news.length) return { graded: 0 };

  const [{ getPersonalities, addPost }, { gradeTrade }, { personaAvatarUrl }, { addReply }] = await Promise.all([
    import('./store'), import('./generate'), import('./avatar'), import('./threads'),
  ]);
  const [rosters, users, directory, cast] = await Promise.all([
    api.getLeagueRosters(leagueId).catch(() => [] as any[]),
    api.getLeagueUsers(leagueId).catch(() => [] as any[]),
    getPlayersDirectory().catch(() => ({} as Record<string, any>)),
    getPersonalities(),
  ]);
  const people = cast.filter((p: Personality) => p.enabled && !p.hidden);
  const graders = people.filter(p => p.kinds.includes('tradeGrade'));
  const pool = graders.length ? graders : people.filter(p => (p.type ?? 'media') === 'media');
  if (!pool.length) return { graded: 0, skipped: 'no-writers' };

  const teamOf = (rid: number) => {
    const owner = String(rosters.find((r: any) => r.roster_id === rid)?.owner_id ?? '');
    const u = (users as any[]).find(x => String(x.user_id) === owner);
    return u?.metadata?.team_name || u?.display_name || `Team ${rid}`;
  };
  const playerName = (id: string) => {
    const p = directory[id];
    return p ? (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || id) + (p.position ? ` (${p.position})` : '') : id;
  };
  const pickName = (pk: any) => `${pk.season} round ${pk.round} pick`;

  let graded = 0;
  for (const t of news) {
    const id = String(t.transaction_id);
    // One grader per trade, even if two runs overlap.
    if (await redis.get(LOCK(id))) continue;
    await redis.set(LOCK(id), '1', 600);
    try {
      const rids: number[] = [...new Set<number>((t.roster_ids ?? []).map(Number))];
      const sides = rids.map(rid => ({
        teamName: teamOf(rid),
        receives: [
          ...Object.entries(t.adds ?? {}).filter(([, r]) => Number(r) === rid).map(([pid]) => playerName(pid)),
          ...(t.draft_picks ?? []).filter((pk: any) => Number(pk.owner_id) === rid).map(pickName),
        ],
        gives: [
          ...Object.entries(t.drops ?? {}).filter(([, r]) => Number(r) === rid).map(([pid]) => playerName(pid)),
          ...(t.draft_picks ?? []).filter((pk: any) => Number(pk.previous_owner_id) === rid).map(pickName),
        ],
      }));
      const writer = pool[hash(id) % pool.length];
      const grade = await gradeTrade(writer, { season: String(nfl?.season ?? new Date().getFullYear()), week: Number(t.leg ?? week), sides });
      const now = new Date().toISOString();
      const post: FeedPost = {
        id: `${Date.now()}-${writer.id}-trade`,
        personalityId: writer.id, personaName: writer.name, personaHandle: writer.handle, personaAccent: writer.accent,
        personaType: writer.type ?? 'media', personaAvatar: personaAvatarUrl(writer),
        kind: 'tradeGrade', content: grade, createdAt: now, publishAt: now, source: 'cron',
        subject: sides[0]?.teamName,
      };
      await addPost(post);
      await remember([id]);
      graded++;
      // Someone always has a take on someone else's grade: a reply within the quarter hour.
      await addReply(people, post, [], Date.now() + (5 + Math.random() * 10) * 60_000).catch(err =>
        console.error('[tradeWatch] reply failed', err instanceof Error ? err.message : err));
    } catch (err) {
      console.error('[tradeWatch] could not grade', id, err instanceof Error ? err.message : err);
    } finally {
      await redis.del(LOCK(id)).catch(() => {});
    }
  }
  return { graded };
}
