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
// "moved" is here on its own, not only as "moved on from": a post reading
// "just moved DJ Moore and Justin Jefferson for Ja'Marr Chase" named both
// sides the wrong way round and matched no verb at all, so it was published
// unjudged. "traded" bare is included for the same reason.
const AWAY = /\b(ship(?:ped|s|ping)?(?: off| out)?|sent|deal(?:t|ed)?|traded(?: away)?|trades away|gave up|gives up|giving up|offload(?:ed)?|moved(?: on from)?|moves|flipped|flips|dumped|parted with|let go of|sold)\b/i;
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

/** Last name, with the common suffixes dropped. */
function surnameOf(full: string): string {
  const parts = full.trim().split(/\s+/).filter(w => !/^(jr\.?|sr\.?|i{1,3}|iv|v)$/i.test(w));
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Every way a traded player might be named in a post.
 *
 * Full-name-only matching missed the failure that prompted this: a post read
 * "traded AWAY their two best receivers for Chase", and because it never wrote
 * "Ja'Marr Chase" the checker saw no player at all and passed it. People write
 * surnames, so surnames have to be matched.
 *
 * Two guards keep that from firing on prose. A surname is only used when it
 * belongs to exactly one traded player, and it is matched case sensitively,
 * because a good half of them are ordinary words: chase, brown, moore, hill,
 * love. The capital is what separates the player from the verb.
 */
function aliasesFor(facts: Map<string, TradeFact>): Map<string, string[]> {
  const count = new Map<string, number>();
  for (const f of facts.values()) {
    const s = surnameOf(f.player);
    if (s) count.set(s.toLowerCase(), (count.get(s.toLowerCase()) ?? 0) + 1);
  }
  const out = new Map<string, string[]>();
  for (const [key, f] of facts) {
    const s = surnameOf(f.player);
    const usable = s.length >= 4 && count.get(s.toLowerCase()) === 1;
    out.set(key, usable ? [f.player, s] : [f.player]);
  }
  return out;
}

/**
 * Phrasing that reverses the direction of the verb for the name that follows.
 *
 * "Traded away Moore for Chase" is one claim in each direction, and the verb
 * nearest Chase is the away verb, so without this the checker reads it as
 * Chase having been sent away and a genuine inversion passes as true.
 */
const RECEIVES_NEXT = /\b(?:in exchange for|in return for|for|to (?:get|land|acquire|add))\b/i;

/** Where a player is named in a sentence, by any alias, or -1. */
function findPlayer(sentence: string, aliases: string[]): number {
  const lower = sentence.toLowerCase();
  // The full name is unambiguous, so it wins and is matched loosely.
  const full = lower.indexOf(aliases[0].toLowerCase());
  if (full !== -1) return full;
  if (aliases.length < 2) return -1;
  const m = sentence.match(new RegExp(`\\b${aliases[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
  return m?.index ?? -1;
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
  const aliases = aliasesFor(facts);
  const problems: string[] = [];

  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase();

    for (const [key, fact] of facts) {
      const iPlayer = findPlayer(sentence, aliases.get(key) ?? [fact.player]);
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

        // Everything after "for" is what came back, however long the list.
        // Scoping this to the span matters: only a "for" standing between the
        // verb and this player reverses the claim about this player.
        const cameBack = lastOf(RECEIVES_NEXT) > Math.max(away, inbound);

        if (away > inbound && !cameBack) {
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
