/**
 * Refuses copy that miscounts who is undefeated or winless.
 *
 * A week 2 preview opened "Four undefeated teams cannot all survive the
 * weekend" in a league with three. The standings handed to it were correct;
 * the tally was the model's own, and in a league that plays median matches
 * every week is two games, so the records it was counting do not look like the
 * records in any other league it has read.
 *
 * The brief now states the lists outright. This is the half that refuses a
 * draft which states them differently anyway, on the same principle as the
 * trade and game-status checks beside it: tell the writer, then verify.
 *
 * ── Built to avoid false alarms ──────────────────────────────────────────────
 *
 * Two narrow patterns, both within a single sentence:
 *
 *   1. A stated count beside the word, "four undefeated teams", that disagrees
 *      with the real one.
 *
 *   2. A team named as undefeated or winless when it is not, and only where the
 *      sentence binds the two directly: "X is undefeated" or "the undefeated
 *      X". "X faces the undefeated Y" says nothing about X, so it is left
 *      alone.
 *
 * Sentences about a past season are skipped entirely, since "the last
 * undefeated team in league history" is not a claim about this week.
 */

import { buildLeagueBrief } from './leagueBrief';

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, sixteen: 16,
  thirteen: 13, fifteen: 15, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const UNDEFEATED = '(?:undefeated|unbeaten|spotless|flawless)';
const WINLESS = '(?:winless|winless\\s+and\\s+\\w+)';

/** A count sitting in front of the word: "four undefeated teams", "three remain unbeaten". */
function statedCount(sentence: string, word: string): number | null {
  const num = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
  // Up to three filler words, which covers "three teams remain unbeaten" and
  // "four still undefeated sides" without reaching across a clause.
  const re = new RegExp(`\\b${num}\\b(?:\\s+\\w+){0,3}\\s+${word}\\b`, 'i');
  const m = re.exec(sentence);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? null;
}

/** "X is undefeated", "X remains unbeaten", "the undefeated X". */
function namedAs(sentence: string, team: string, word: string): boolean {
  const t = team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const linking = new RegExp(
    `\\b${t}\\b[^.]{0,24}?\\b(?:is|are|sits?|sitting|remains?|stays?|stands?|still)\\s+(?:still\\s+)?${word}\\b`,
    'i',
  );
  const modifier = new RegExp(`${word}\\s+(?:\\w+\\s+){0,2}${t}\\b`, 'i');
  return linking.test(sentence) || modifier.test(sentence);
}

/** A sentence about a previous season is not a claim about this one. */
const HISTORICAL = /\b(?:19|20)\d{2}\b|\blast (?:season|year)\b|\b(?:league|franchise) history\b|\bever\b|\ball time\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

export async function checkRecordClaims(text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const brief = await buildLeagueBrief().catch(() => null);
  const facts = brief?.recordFacts;
  // Nothing played yet means nobody is undefeated or winless in any useful
  // sense, and a preseason preview saying so is not worth refusing over.
  if (!facts || facts.gamesPlayed === 0) return [];

  const groups = [
    { word: UNDEFEATED, label: 'undefeated', names: facts.undefeated },
    { word: WINLESS, label: 'winless', names: facts.winless },
  ];
  const problems = new Set<string>();
  const teams = brief!.teams.map(t => t.teamName);

  for (const s of sentences(text)) {
    if (HISTORICAL.test(s)) continue;

    for (const g of groups) {
      if (!new RegExp(g.word, 'i').test(s)) continue;

      const said = statedCount(s, g.word);
      if (said !== null && said !== g.names.length) {
        problems.add(
          `The draft says ${said} ${g.label} team${said === 1 ? '' : 's'}. There ${
            g.names.length === 1 ? 'is 1' : `are ${g.names.length}`
          }: ${g.names.join(', ') || 'none'}. Remember every week is two games in this league.`);
      }

      for (const team of teams) {
        if (g.names.includes(team)) continue;
        if (namedAs(s, team, g.word)) {
          const t = brief!.teams.find(x => x.teamName === team)!;
          problems.add(
            `${team} is described as ${g.label} but is ${t.record}. The ${g.label} teams are: ${
              g.names.join(', ') || 'none'}.`);
        }
      }
    }
  }

  return [...problems];
}
