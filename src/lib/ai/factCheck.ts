import { getLeagueRosters, getLeagueUsers, getSeasonTransactions, getLeagueWeeks } from '@/lib/api';
import { getCurrentLeagueId } from '@/config/league';
import { getPlayersDirectory } from '@/lib/playerStats';

/**
 * Verifies generated copy against the real transaction record.
 *
 * The writers are given a brief that states every trade in both directions and
 * are told explicitly not to invert it. They invert it anyway: one post had
 * ShitNecks "shipping Jaylen Warren" in a trade where ShitNecks RECEIVED him.
 * Prompt rules have not been enough, and no additional data source fixes this,
 * because the data was already correct and unambiguous. The only reliable
 * remedy is to check the claim after the fact and refuse to publish a
 * contradiction.
 *
 * Deliberately narrow: it only judges assertions of the form "<team> traded
 * away <player>" or "<team> acquired <player>", which is the failure that keeps
 * happening. Anything it cannot confidently parse, it leaves alone, so a
 * strained metaphor is never mistaken for a false claim.
 */

export interface TradeFact {
  player: string;
  /** Teams that RECEIVED this player in a trade. */
  receivedBy: Set<string>;
  /** Teams that GAVE this player up in a trade. */
  gaveUpBy: Set<string>;
}

/** Verbs that assert a team sent a player away. */
const AWAY = /\b(ship(?:ped|s|ping)?|sent|deal(?:t|ed)?|traded away|gave up|gives up|giving up|offload(?:ed)?|moved on from|flipped|dumped)\b/i;
/** Verbs that assert a team took a player in. */
const IN = /\b(acquir(?:ed|es)|land(?:ed|s)|grabb(?:ed|s)|pick(?:ed)? up|brought in|added|got back|received|traded for)\b/i;

let cache: { at: number; facts: Map<string, TradeFact>; teams: string[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Index every traded player by who received and who surrendered him. */
export async function loadTradeFacts(): Promise<{ facts: Map<string, TradeFact>; teams: string[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;

  const leagueId = await getCurrentLeagueId();
  const weeks = await getLeagueWeeks(leagueId).catch(() => 18);
  const [txs, rosters, users, players] = await Promise.all([
    getSeasonTransactions(leagueId, weeks),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId),
    getPlayersDirectory(),
  ]);

  const userById = new Map<string, any>(users.map((u: any) => [u.user_id, u]));
  const teamOf = new Map<number, string>();
  for (const r of rosters as any[]) {
    const u = userById.get(r.owner_id);
    teamOf.set(r.roster_id, u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`);
  }

  const nameOf = (pid: string) => {
    const p = players[pid] ?? {};
    return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '';
  };

  const facts = new Map<string, TradeFact>();
  const touch = (player: string) => {
    const key = player.toLowerCase();
    if (!facts.has(key)) facts.set(key, { player, receivedBy: new Set(), gaveUpBy: new Set() });
    return facts.get(key)!;
  };

  for (const t of txs as any[]) {
    if (t.status !== 'complete' || t.type !== 'trade') continue;
    for (const [pid, rid] of Object.entries((t.adds ?? {}) as Record<string, number>)) {
      const n = nameOf(pid); if (!n) continue;
      const team = teamOf.get(rid); if (team) touch(n).receivedBy.add(team);
    }
    for (const [pid, rid] of Object.entries((t.drops ?? {}) as Record<string, number>)) {
      const n = nameOf(pid); if (!n) continue;
      const team = teamOf.get(rid); if (team) touch(n).gaveUpBy.add(team);
    }
  }

  cache = { at: Date.now(), facts, teams: [...teamOf.values()] };
  return cache;
}

/**
 * One sentence at a time: a claim never spans a full stop.
 *
 * Splitting naively on every period tore "A.J. Brown" in half, so neither
 * fragment contained the player's full name and a false claim about him sailed
 * through. The lookbehind has to reach past the period to the letter before
 * it: a capital there means an initial, not a sentence ending.
 */
function sentences(text: string): string[] {
  return text.split(/(?<=[!?])\s+|(?<=\.)(?<![A-Z]\.)\s+/).filter(Boolean);
}

/**
 * Returns a list of contradictions, empty when the copy is clean.
 *
 * Only flags a sentence naming exactly one team and one traded player, with a
 * direction verb between them. Ambiguity is treated as innocent.
 */
export async function checkTradeClaims(text: string): Promise<string[]> {
  const { facts, teams } = await loadTradeFacts();
  const problems: string[] = [];

  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase();

    for (const fact of facts.values()) {
      const iPlayer = lower.indexOf(fact.player.toLowerCase());
      if (iPlayer === -1) continue;

      for (const team of teams) {
        const iTeam = lower.indexOf(team.toLowerCase());
        // Only judge "<team> ... <verb> ... <player>". The reverse order reads
        // differently ("Warren, who ShitNecks value...") and is left alone.
        if (iTeam === -1 || iTeam > iPlayer) continue;

        // The verb NEAREST the player decides the direction. Taking any verb in
        // the span misread "landed Jaylen Warren and gave up Matthew Golden",
        // where both directions appear in one true sentence.
        const span = sentence.slice(iTeam, iPlayer);
        const lastOf = (re: RegExp) => {
          let idx = -1;
          const g = new RegExp(re.source, 'gi');
          for (const m of span.matchAll(g)) idx = m.index ?? idx;
          return idx;
        };
        const away = lastOf(AWAY);
        const inbound = lastOf(IN);
        if (away === -1 && inbound === -1) continue;

        if (away > inbound) {
          if (!fact.gaveUpBy.has(team)) {
            const truth = fact.gaveUpBy.size
              ? `${[...fact.gaveUpBy].join(', ')} gave him up`
              : 'he was never traded away by anyone';
            problems.push(
              `Says ${team} traded away ${fact.player}, but ${truth}` +
              (fact.receivedBy.has(team) ? ` and ${team} RECEIVED him.` : '.'),
            );
          }
        } else if (!fact.receivedBy.has(team)) {
          const truth = fact.receivedBy.size
            ? `${[...fact.receivedBy].join(', ')} received him`
            : 'no team received him by trade';
          problems.push(
            `Says ${team} acquired ${fact.player}, but ${truth}` +
            (fact.gaveUpBy.has(team) ? ` and ${team} GAVE HIM UP.` : '.'),
          );
        }
      }
    }
  }

  return [...new Set(problems)];
}

/** Pull every string out of generated content so nested fields are checked too. */
export function collectText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectText(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectText(v, out));
  return out;
}
