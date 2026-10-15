import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { safeMarkdown } from './constitutionDoc';
export { safeMarkdown };

export interface ConstitutionMeta {
  version: string;
  lastUpdated: string;
  description?: string;
}

export interface ConstitutionSection {
  id: string;
  level: number;
  title: string;
  html: string;
  text: string;
}

export interface LeagueSettings {
  name: string;
  season: string;
  leagueType: number;   // 0=redraft, 1=keeper, 2=dynasty
  numTeams: number;
  rosterPositions: string[];
  scoringSettings: Record<string, number>;
  playoffTeams: number;
  playoffWeekStart: number;
  tradeDeadline: number;
  tradeReviewDays: number;
  vetoVotesNeeded: number;
  pickTrading: boolean;
  waiverType: number;   // 0=rolling, 1=FAAB, 2=free agent
  waiverBudget: number;
  waiverDayOfWeek: number;
  maxKeepers: number;
  draftRounds: number;
  draftType: string | null;  // 'snake' | 'linear' | 'auction', from draft object
  reserveSlots: number;
  taxiSlots: number;
  taxiDeadline: number;
  leagueAverageMatch: boolean;
}

export interface ConstitutionData {
  meta: ConstitutionMeta;
  sections: ConstitutionSection[];
  leagueSettings: LeagueSettings | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseLeagueSettings(raw: any, draftType: string | null = null): LeagueSettings {
  const s = raw?.settings ?? {};
  return {
    name:               raw?.name              ?? 'Fantasy Football League',
    season:             raw?.season            ?? '',
    leagueType:         s.type                 ?? 0,
    numTeams:           s.num_teams            ?? raw?.total_rosters ?? 12,
    rosterPositions:    raw?.roster_positions  ?? [],
    scoringSettings:    raw?.scoring_settings  ?? {},
    playoffTeams:       s.playoff_teams        ?? 0,
    playoffWeekStart:   s.playoff_week_start   ?? 0,
    tradeDeadline:      s.trade_deadline       ?? 0,
    tradeReviewDays:    s.trade_review_days    ?? 0,
    vetoVotesNeeded:    s.veto_votes_needed    ?? 0,
    pickTrading:        s.pick_trading         === 1,
    waiverType:         s.waiver_type          ?? 0,
    waiverBudget:       s.waiver_budget        ?? 0,
    waiverDayOfWeek:    s.waiver_day_of_week   ?? 2,
    maxKeepers:         s.max_keepers          ?? 0,
    draftRounds:        s.draft_rounds         ?? 0,
    draftType,
    reserveSlots:       s.reserve_slots        ?? 0,
    taxiSlots:          s.taxi_slots           ?? 0,
    taxiDeadline:       s.taxi_deadline        ?? 0,
    leagueAverageMatch: s.league_average_match === 1,
  };
}

/**
 * Where a league's constitution comes from: what its admin saved (see
 * saveConstitution); else, on a self-hosted copy, content/constitution.md in
 * the repository, as before; else nothing. A hosted league never falls back to
 * the repository's file: that is one particular league's rules, not theirs.
 */
export type ConstitutionSource = 'saved' | 'file' | 'none';

export interface StoredConstitution {
  markdown: string;
  version: string;
  description: string | null;
  /** The date the rules last changed (YYYY-MM-DD), shown on the page. */
  lastUpdated: string;
  savedAt: string;
}
export interface ConstitutionRevision extends StoredConstitution { note: string | null }

const KEY = 'lp_constitution';
const HISTORY = 'lp_constitution_history';
const HISTORY_MAX = 30;

function fromFile(): StoredConstitution | null {
  try {
    const { data, content } = matter(fs.readFileSync(path.join(process.cwd(), 'content', 'constitution.md'), 'utf-8'));
    return {
      markdown: content.trim() + '\n', version: String(data.version ?? '1.0'), description: data.description ?? null,
      lastUpdated: String(data.lastUpdated ?? ''), savedAt: '',
    };
  } catch {
    return null;
  }
}

export async function getConstitution(): Promise<{ doc: StoredConstitution | null; source: ConstitutionSource }> {
  const { readJson } = await import('./jsonStore');
  const saved = await readJson<StoredConstitution | null>(KEY, 'constitution.json', null);
  if (saved) return { doc: saved, source: 'saved' };
  if (process.env.LP_HOSTED === '1') return { doc: null, source: 'none' };
  const file = fromFile();
  return file ? { doc: file, source: 'file' } : { doc: null, source: 'none' };
}

export async function constitutionHistory(): Promise<ConstitutionRevision[]> {
  const { readJson } = await import('./jsonStore');
  return readJson<ConstitutionRevision[]>(HISTORY, 'constitution-history.json', []);
}

/** Publishes a new version; the one it replaces goes into the history, newest first. */
export async function saveConstitution(next: Omit<StoredConstitution, 'savedAt'>, note: string | null): Promise<StoredConstitution> {
  const { writeJson } = await import('./jsonStore');
  const saved: StoredConstitution = { ...next, savedAt: new Date().toISOString() };
  const history = await constitutionHistory();
  await writeJson(HISTORY, 'constitution-history.json', [{ ...saved, note }, ...history].slice(0, HISTORY_MAX));
  await writeJson(KEY, 'constitution.json', saved);
  return saved;
}

/** The constitution as the page shows it: its details and its sections. */
export async function getMarkdownSections(): Promise<{ meta: ConstitutionMeta; sections: ConstitutionSection[]; source: ConstitutionSource }> {
  const { doc, source } = await getConstitution();
  const meta: ConstitutionMeta = {
    version: doc?.version ?? '1.0',
    lastUpdated: doc?.lastUpdated ?? '',
    description: doc?.description ?? undefined,
  };
  return { meta, sections: doc ? sectionsOf(doc.markdown) : [], source };
}

export function sectionsOf(content: string): ConstitutionSection[] {
  const sections: ConstitutionSection[] = [];
  let currentHeading: { level: number; title: string } | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    const bodyMd = buffer.join('\n').trim();
    const html   = bodyMd ? safeMarkdown(bodyMd) : '';
    sections.push({
      id:    slugify(currentHeading.title),
      level: currentHeading.level,
      title: currentHeading.title,
      html,
      text:  stripHtml(html),
    });
    buffer = [];
  };

  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      flush();
      currentHeading = { level: match[1].length, title: match[2].trim() };
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}
