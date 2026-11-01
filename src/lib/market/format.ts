/**
 * A league's format, the thing "leagues like yours" means: what kind of league it is, how it
 * scores catches, and how many quarterbacks it starts. Everything the market (lib/market) counts
 * is kept per format, so a dynasty superflex league is compared with dynasty superflex leagues.
 *
 *   fmt   "<kind>|<scoring>|<qb>"   e.g. "dynasty|ppr|sf", "redraft|half|1qb"
 *
 * Pure: the browser, the server and Node's own test runner all use it.
 */

export type Kind = 'redraft' | 'keeper' | 'dynasty' | 'bestball';
export type Scoring = 'ppr' | 'half' | 'std' | 'other';
export type Qbs = '1qb' | 'sf';

export interface Format { fmt: string; kind: Kind; scoring: Scoring; qb: Qbs }

/** The parts of a Sleeper league (or an ESPN one, translated) a format is read from. */
export interface LeagueLike {
  settings?: { type?: number; best_ball?: number } | null;
  scoring_settings?: Record<string, number> | null;
  roster_positions?: string[] | null;
}

export function formatOf(league: LeagueLike): Format {
  const s = league.settings ?? {};
  const kind: Kind = s.best_ball ? 'bestball' : s.type === 2 ? 'dynasty' : s.type === 1 ? 'keeper' : 'redraft';
  const rec = Number(league.scoring_settings?.rec ?? 0);
  const scoring: Scoring = rec >= 0.95 && rec <= 1.05 ? 'ppr' : Math.abs(rec - 0.5) < 0.05 ? 'half' : rec === 0 ? 'std' : 'other';
  const slots = league.roster_positions ?? [];
  const qb: Qbs = slots.includes('SUPER_FLEX') || slots.filter(p => p === 'QB').length >= 2 ? 'sf' : '1qb';
  return { fmt: `${kind}|${scoring}|${qb}`, kind, scoring, qb };
}

export function parseFormat(fmt: string): Format | null {
  const [kind, scoring, qb] = fmt.split('|');
  if (!['redraft', 'keeper', 'dynasty', 'bestball'].includes(kind)) return null;
  if (!['ppr', 'half', 'std', 'other'].includes(scoring) || !['1qb', 'sf'].includes(qb)) return null;
  return { fmt, kind: kind as Kind, scoring: scoring as Scoring, qb: qb as Qbs };
}

const KIND_LABEL: Record<Kind, string> = { redraft: 'Redraft', keeper: 'Keeper', dynasty: 'Dynasty', bestball: 'Best ball' };
const SCORING_LABEL: Record<Scoring, string> = { ppr: 'PPR', half: 'half PPR', std: 'standard scoring', other: 'custom scoring' };

/** "Dynasty, PPR, superflex". */
export function formatLabel(f: Format): string {
  return `${KIND_LABEL[f.kind]}, ${SCORING_LABEL[f.scoring]}, ${f.qb === 'sf' ? 'superflex' : 'one QB'}`;
}

/**
 * The formats to compare a league with, closest first: its own, then the same kind and
 * quarterbacks with any scoring, then the same number of quarterbacks in any kind of league,
 * then the same kind, then every league. Quarterbacks come before kind because they decide
 * lineups: in superflex nearly every quarterback starts, in one-QB leagues most sit. The market
 * reads the first that has enough leagues, so a rare format still gets an answer, labelled honestly.
 */
export function comparisonLadder(f: Format, all: string[]): { label: string; fmts: string[] }[] {
  const parsed = all.map(parseFormat).filter((x): x is Format => Boolean(x));
  return [
    { label: formatLabel(f), fmts: [f.fmt] },
    { label: `${KIND_LABEL[f.kind]}, ${f.qb === 'sf' ? 'superflex' : 'one QB'}, any scoring`, fmts: parsed.filter(p => p.kind === f.kind && p.qb === f.qb).map(p => p.fmt) },
    { label: `${f.qb === 'sf' ? 'Superflex' : 'One-QB'} leagues of every kind`, fmts: parsed.filter(p => p.qb === f.qb && p.kind !== 'bestball').map(p => p.fmt) },
    { label: `${KIND_LABEL[f.kind]} leagues`, fmts: parsed.filter(p => p.kind === f.kind).map(p => p.fmt) },
    { label: 'All Sleeper leagues sampled', fmts: parsed.map(p => p.fmt) },
  ];
}
