/**
 * Refuses copy that gets game status wrong.
 *
 * The game clock tells every writer which matchups are final and which players
 * have not played. Telling is not enough. In the first live post written after
 * the clock existed, a persona wrote that a quarterback "has not played yet,
 * that is a problem for Monday" about a player whose Sunday game had finished
 * and whose matchup was marked FINAL. It had seen him on a roster with no score
 * in front of it and supplied a status of its own.
 *
 * So, like the trade checker beside it, this reads the draft and names the
 * errors precisely enough to feed back as a correction.
 *
 * ── Built to avoid false alarms ──────────────────────────────────────────────
 *
 * Both checks require a specific, unambiguous pairing within one sentence:
 *
 *   1. A player who HAS played, named in full, beside a "has not played"
 *      phrase. Full names only, since a bare surname like "Williams" matches
 *      half a dozen starters.
 *
 *   2. BOTH sides of an unfinished matchup named in the same sentence as a
 *      result verb. Requiring both opponents is what separates "beat the
 *      Tartarians" this week from "won the title last year".
 */

import { buildGameClock } from './gameClock';

/** Phrases asserting a player has not yet taken the field. */
const NOT_PLAYED = new RegExp(
  [
    "has(?:n't| not)(?: yet)? played",
    'yet to play', 'still to play', 'has yet to',
    'still waiting', 'waiting on', 'waiting for',
    "hasn't taken the field", 'has not taken the field',
    'on deck', 'still to come', 'yet to suit up',
    'has not (?:suited|stepped) (?:up|on)',
  ].join('|'),
  'i',
);

/**
 * Wording that declares a finished result, verbs and nouns both.
 *
 * Nouns matter: "a fifty-three point win for X over Y" asserts a result as
 * surely as "X beat Y", and slipped past a verbs-only list. Bare "win" is left
 * out on purpose, since "win chance" and "chance to win" are exactly how an
 * in-progress matchup should be described.
 */
const RESULT = new RegExp([
  '\\b(?:won|wins|beat|beats|beaten|defeated|defeats|bested|topped|dispatched)\\b',
  '\\blos(?:t|es) to\\b', '\\btook down\\b', '\\bheld off\\b', '\\bput away\\b',
  '\\bclosed out\\b', '\\bclinched\\b', '\\bsealed (?:it|the win|the deal)\\b',
  '\\bfinal score\\b', '\\bcruised past\\b', '\\bblew out\\b', '\\bblowout\\b',
  '\\brout(?:ed)?\\b', '\\bgot (?:beat|beaten|smoked|crushed|blown out)\\b',
  '\\b(?:win|victory) (?:for|over|against)\\b', '\\bvictory\\b', '\\bdefeat of\\b',
  '\\bloss to\\b',
].join('|'), 'i');

/**
 * Forward-looking or conditional framing. "X will beat Y tonight" is a
 * prediction, which is exactly what a writer should do with a game in progress,
 * so such sentences are not treated as reporting a result.
 */
const FUTURE = /\b(?:will|would|could|should|might|going to|gonna|needs? to|expected to|projected to|likely to|on track to|poised to|set to|if|unless|chance to|to (?:beat|win)|can still|still has to)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

function mentions(sentence: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(sentence);
}

export async function checkGameStatusClaims(text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const clock = await buildGameClock();
  if (!clock.fixtures.length) return [];

  const problems = new Set<string>();
  const stillToPlay = new Set(clock.stillToPlayNames.map(n => n.toLowerCase()));

  for (const s of sentences(text)) {
    // 1. A finished player described as not having played.
    if (NOT_PLAYED.test(s)) {
      for (const name of clock.playedNames) {
        // A name on both lists cannot happen, but never flag a player who is
        // genuinely still to play.
        if (stillToPlay.has(name.toLowerCase())) continue;
        if (mentions(s, name)) {
          problems.add(
            `${name} has ALREADY PLAYED this week, but the draft says they have not. ` +
            'Only players named under "still to play" in GAME STATUS have not played.');
        }
      }
    }

    // 2. An unfinished matchup reported as decided.
    if (RESULT.test(s) && !FUTURE.test(s)) {
      for (const f of clock.fixtures) {
        if (f.settled) continue;
        if (mentions(s, f.teamA) && mentions(s, f.teamB)) {
          problems.add(
            `${f.teamA} vs ${f.teamB} is NOT FINAL, but the draft reports a result. ` +
            'Describe it as in progress: who leads, by how much, and who is still to play.');
        }
      }
    }
  }

  return [...problems];
}
