import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { marked } from 'marked';

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
  draftType: string | null;  // 'snake' | 'linear' | 'auction' — from draft object
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

export function getMarkdownSections(): { meta: ConstitutionMeta; sections: ConstitutionSection[] } {
  const filePath = path.join(process.cwd(), 'content', 'constitution.md');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);

  const meta: ConstitutionMeta = {
    version:     data.version     ?? '1.0',
    lastUpdated: data.lastUpdated ?? '',
    description: data.description,
  };

  const sections: ConstitutionSection[] = [];
  let currentHeading: { level: number; title: string } | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    const bodyMd = buffer.join('\n').trim();
    const html   = bodyMd ? (marked.parse(bodyMd, { async: false }) as string) : '';
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

  return { meta, sections };
}
