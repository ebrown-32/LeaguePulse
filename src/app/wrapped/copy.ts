/**
 * What League Wrapped says (lib/wrapped/engine for the numbers). Lines come in tiers, so a loss
 * by 0.4 reads differently from a loss by 9, and each tier has a few variations picked by a seed
 * of the manager and season: two managers rarely get the same joke, and a reload never changes it.
 */

export type Pick = <T>(xs: T[]) => T;

export function picker(seed: string): Pick {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let n = 0;
  return <T,>(xs: T[]) => xs[Math.abs(h + Math.imul(++n, 2654435761)) % xs.length];
}

const pts = (x: number) => x.toFixed(1);
/** A sentence ending on a name: one full stop, even after an initial ("Eli B."). */
export const end = (name: string) => (name.endsWith('.') ? name : `${name}.`);

export const copy = {
  record(p: Pick, w: number, l: number): string {
    const pct = w + l ? w / (w + l) : 0;
    if (pct >= 0.75) return p(['A wrecking ball with a waiver wire.', 'The rest of the league was mostly a formality.', 'Opponents checked the schedule and sighed.']);
    if (pct >= 0.55) return p(['Comfortably above water.', 'More good Sundays than bad ones.', 'Solid. Respectable. Feared, even, on a good week.']);
    if (pct >= 0.45) return p(['Perfectly, painfully average.', 'Coin-flip energy, all season.', 'The definition of "in the mix."']);
    if (pct >= 0.25) return p(['It was a building year. Allegedly.', 'Character was built. Wins, less so.', 'The losses were educational.']);
    return p(['Somebody had to be the bar everyone cleared.', 'A season best enjoyed with the lights off.', 'Rock bottom has a basement, and you found it.']);
  },
  best(p: Pick, opp: string): string {
    return p([`${opp} never stood a chance.`, `${opp} is still looking for the license plate.`, `Somewhere, ${opp} is still recalculating.`, `Frame it. Hang it in the hallway.`]);
  },
  worst(p: Pick, score: number): string {
    if (score < 60) return p(['Did you set a lineup, or just think about it?', 'We checked. All your players were technically alive.', 'Some weeks you play. This week you watched.']);
    return p(['Not your proudest Sunday.', 'Let’s never speak of it again.', 'Even the bench was embarrassed.']);
  },
  heartbreak(p: Pick, margin: number): string {
    if (margin < 1) return p([`${pts(margin)} points. That’s one reception. One.`, `Lost by ${pts(margin)}. Somewhere, a kicker shanked an extra point and you’ve never recovered.`, `${pts(margin)}. A rounding error ended your week.`]);
    if (margin < 5) return p(['One more catch. One more yard. One more anything.', 'Close enough to taste it. Not close enough to win it.', 'The kind of loss you replay in the shower.']);
    return p(['Even your closest loss wasn’t that close. That’s a choice.', 'Never really a nail-biter, was it.']);
  },
  luck(p: Pick, delta: number): string {
    if (delta >= 1.5) return p(['The schedule gods owe you nothing. You owe them a thank-you card.', 'You won games you had no business winning. Respect.', 'Horseshoe energy.']);
    if (delta >= 0.5) return p(['A little luck went a long way.', 'The bounces went your way, and you let them.']);
    if (delta > -0.5) return p(['You got exactly what you earned. Boring, but fair.', 'Luck-neutral. The universe was strictly business.']);
    if (delta > -1.5) return p(['The schedule was not kind.', 'You kept running into teams having their week of the year.']);
    return p(['You were robbed. Repeatedly. In broad daylight.', 'If luck was a player, you’d have dropped it in week two.', 'The schedule had a personal vendetta.']);
  },
  mvp(p: Pick, share: number, name: string): string {
    if (share >= 25) return p([`${name} didn’t just carry you. ${name} did your taxes.`, `A one-man show with a supporting cast of extras.`, `Without ${name}, this is a very different story.`]);
    return p([`The engine of the operation.`, `${name} showed up every week. Mostly.`, `Your most reliable relationship this season.`]);
  },
  bench(p: Pick, eff: number): string {
    if (eff >= 92) return p(['Lineup decisions of a seasoned general manager.', 'You started the right guys. Almost every week. Show-off.']);
    if (eff >= 85) return p(['Mostly the right calls. Mostly.', 'A few regrets, but who’s counting. (We are.)']);
    return p(['The bench was the best team in your league.', 'Your best players spent a lot of Sundays on the couch.', 'Next season, try starting the guys who score.']);
  },
  benching(p: Pick): string {
    return p(['We’re not mad. We’re just disappointed.', 'This one’s going on the highlight reel. The wrong one.', 'Gut feeling: overruled by the scoreboard.']);
  },
  steal(p: Pick, round: number): string {
    return p([`Round ${round}. Daylight robbery.`, `Everyone else passed. Everyone else was wrong.`, `Round ${round} picks aren’t supposed to do this.`]);
  },
  bust(p: Pick): string {
    return p(['An early pick and a long, quiet season.', 'The draft room was so excited. Briefly.', 'Expectations: high. Returns: a different story.']);
  },
  pickup(p: Pick, bid: number | null): string {
    if (bid === 0) return p(['Free. Absolutely free.', 'Zero dollars. Best investment of the year.']);
    return p(['The waiver wire giveth.', 'Found treasure in the bargain bin.', 'Somebody else dropped him. Their loss.']);
  },
  trade(p: Pick, net: number): string {
    if (net >= 60) return p(['Grand theft auto.', 'The other side would like a word.', 'This trade should be studied in schools.']);
    return p(['A quietly great piece of business.', 'Won the trade. Didn’t even gloat. Much.']);
  },
  badTrade(p: Pick): string {
    return p(['Let’s just say the other side is still smiling.', 'Some trades age like wine. This one, like milk.', 'You were the "other side" in someone else’s trade of the year.']);
  },
  nemesis(p: Pick, name: string): string {
    return p([`${name} lives in your head, rent free.`, `Every time ${name} showed up on the schedule, you knew.`, `${end(name)} Just ${end(name)}`]);
  },
  victim(p: Pick, name: string): string {
    return p([`${name} would like to stop playing you now.`, `You own ${name}. Maybe frame the receipts.`, `${name}: your favorite weekly appointment.`]);
  },
  moves(p: Pick, adds: number, rank: number, managers: number): string {
    if (rank === 1) return p(['Nobody worked the wire harder.', 'The waiver wire has your number saved.', 'Commissioner’s note: please let other people make moves too.']);
    if (rank === managers) return p(['You drafted a team and trusted it. Like a sensible adult.', 'Low maintenance. High faith.']);
    return adds > 20 ? p(['Busy, but not obsessive.']) : p(['Selective. Discerning. Or just busy at work.']);
  },
};

/** Front-page headlines for the newspaper clippings: short, loud, and true to the numbers. */
export const headline = {
  record(p: Pick, name: string, w: number, l: number, champ: boolean): string {
    const up = name.toUpperCase();
    if (champ) return p([`${up} CROWNED`, `${up} TAKES THE TITLE`, `ALL HAIL ${up}`]);
    const pct = w + l ? w / (w + l) : 0;
    if (pct >= 0.65) return p([`${up} ROLLS TO ${w}-${l}`, `${up} RUNS RIOT`, `NOBODY CAN STOP ${up}`]);
    if (pct >= 0.45) return p([`${up} STUCK IN NEUTRAL`, `${up} FINISHES ${w}-${l}, SHRUGS`, `MIDDLE OF THE PACK, AND PROUD`]);
    return p([`${up} SEASON DECLARED A DISASTER AREA`, `${up} WINS ${w}, LOSES PATIENCE`, `${up}: "NEXT YEAR"`]);
  },
  worst(p: Pick, name: string, score: number): string {
    const up = name.toUpperCase();
    return p([`LOCAL TEAM SCORES ${score.toFixed(1)}; NO SURVIVORS`, `${up} PUTS UP ${score.toFixed(1)}, DECLINES TO COMMENT`, `${score.toFixed(1)}: ${up} ASKS FOR PRIVACY AT THIS DIFFICULT TIME`]);
  },
  trade(p: Pick, name: string, partner: string): string {
    const up = name.toUpperCase(), them = partner.toUpperCase();
    return p([`${up} FLEECES ${them}`, `HEIST: ${up} ROBS ${them} IN BROAD DAYLIGHT`, `${them} STILL DOESN’T KNOW WHAT HIT THEM`]);
  },
  rival(p: Pick, nemesis: string, name: string, w: number, l: number): string {
    return p([`${nemesis.toUpperCase()} OWNS ${name.toUpperCase()}, ${l}-${w}`, `THE ${nemesis.toUpperCase()} PROBLEM`, `${name.toUpperCase()} HAS A ${nemesis.toUpperCase()}-SHAPED HOLE IN ITS HEART`]);
  },
  champion(p: Pick, name: string): string {
    const up = name.toUpperCase();
    return p([`${up} WINS IT ALL`, `${up} ON TOP OF THE WORLD`, `THE ${up} ERA BEGINS`]);
  },
};

/** Takes from the league's own writers, one line each, in the press box's voice. */
export const take = {
  best(p: Pick, pts: number): string {
    return p([`${pts.toFixed(1)}. I’ve seen enough. Somebody check this lineup for performance enhancers.`, `That’s not a score, that’s a statement.`, `I had to sit down after this one. Then I stood up and wrote this.`]);
  },
  heartbreak(p: Pick): string {
    return p([`I’ve watched the replay nine times. It still doesn’t go in.`, `Some losses build character. This one just hurt.`, `If you need a minute, take a minute.`]);
  },
  luck(p: Pick, delta: number): string {
    return delta >= 0
      ? p(['I’m not saying they’re lucky. I’m saying I’d buy a lottery ticket from them.', 'Talent? Sure. Horseshoe? Definitely.'])
      : p(['The schedule-makers owe this team an apology and a fruit basket.', 'Some teams lose. This team got robbed.']);
  },
  moves(p: Pick, adds: number): string {
    return adds > 30
      ? p(['I have it on good authority they refresh the waiver wire in their sleep.', 'Commissioner, please check on this manager.'])
      : p(['A patient manager. Or a busy one. Hard to tell.', 'The waiver wire barely knew their name.']);
  },
  bench(p: Pick, eff: number): string {
    return eff >= 90
      ? p(['Pushed the right buttons all year. Coach of the year talk is not crazy.', 'Lineup decisions like a seasoned general manager.'])
      : p(['The bench outscored some teams in this league. Think about that.', 'Start your studs. It’s not complicated. Apparently it is.']);
  },
  archetype(p: Pick, title: string): string {
    return p([`${title}. I’ve been saying it all year.`, `If you didn’t see "${title}" coming, you weren’t paying attention.`, `${title}. Put it on the plaque.`]);
  },
};
