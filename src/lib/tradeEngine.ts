import { generateObject } from 'ai';
import { gateway } from 'ai';
import { z } from 'zod';

const SLEEPER_BASE = 'https://api.sleeper.app/v1';
const RELEVANT_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export const POSITION_COLORS: Record<string, string> = {
  QB:  'text-amber-400  bg-amber-400/10  border-amber-400/30',
  RB:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  WR:  'text-sky-400    bg-sky-400/10    border-sky-400/30',
  TE:  'text-violet-400 bg-violet-400/10 border-violet-400/30',
  K:   'text-slate-400  bg-slate-400/10  border-slate-400/30',
  DEF: 'text-rose-400   bg-rose-400/10   border-rose-400/30',
};

export interface PlayerValue {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  avgPPG: number;
  totalPoints: number;
  gamesPlayed: number;
  value: number;
}

export interface TradeProposal {
  id: string;
  sideA: { rosterId: number; teamName: string; record: string; gives: PlayerValue[] };
  sideB: { rosterId: number; teamName: string; record: string; gives: PlayerValue[] };
  label: string;
  labelVariant: 'green' | 'blue' | 'amber' | 'purple' | 'red';
  tagline: string;
  rationale: string;
  fairness: number;
}

export interface TeamInfo {
  rosterId: number;
  teamName: string;
  record: string;
}

export interface TradeResult {
  proposals: TradeProposal[];
  teams: TeamInfo[];
}

// ── Zod schema for AI output ───────────────────────────────────────────────────

const AiPlayerSchema = z.object({
  name:     z.string().describe('Exact player name as provided in the roster context'),
  position: z.enum(['QB', 'RB', 'WR', 'TE']),
  nflTeam:  z.string(),
  avgPPG:   z.number().min(0),
});

const AiProposalSchema = z.object({
  sideATeam:   z.string().describe('Exact team name from the context'),
  sideAGives:  z.array(AiPlayerSchema).min(1).max(3),
  sideBTeam:   z.string().describe('Exact team name from the context'),
  sideBGives:  z.array(AiPlayerSchema).min(1).max(3),
  label:       z.enum(['Win-Win', 'Sell High', 'Buy Low', 'Big Swing', 'Rebuild Move', 'Steal Alert', 'Championship Push']),
  tagline:     z.string().max(80).describe('One punchy line — under 80 chars'),
  rationale:   z.string().min(80).max(350).describe('2–3 sentences. Specific, opinionated, witty. Reference actual stats and records.'),
  fairness:    z.number().min(10).max(90).describe('0=Side A robbery, 50=balanced, 90=Side B robbery'),
});

const AiResponseSchema = z.object({
  proposals: z.array(AiProposalSchema).min(1).max(20),
});

// ── Data fetching ──────────────────────────────────────────────────────────────

async function fetchLeagueContext(leagueId: string) {
  const nflState = await fetch(`${SLEEPER_BASE}/state/nfl`).then(r => r.json());
  const currentWeek: number = Math.max(1, nflState.week ?? 1);

  const [rosters, users, allPlayers] = await Promise.all([
    fetch(`${SLEEPER_BASE}/league/${leagueId}/rosters`).then(r => r.json()),
    fetch(`${SLEEPER_BASE}/league/${leagueId}/users`).then(r => r.json()),
    fetch(`${SLEEPER_BASE}/players/nfl`).then(r => r.json()),
  ]);

  // Fetch all completed weeks in parallel
  const weeksToFetch = Math.min(currentWeek, 14);
  const matchupWeeks: any[][] = await Promise.all(
    Array.from({ length: weeksToFetch }, (_, i) => i + 1).map(week =>
      fetch(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
  );

  // Aggregate player points from matchup history
  const playerPointsByWeek: Record<string, number[]> = {};
  for (const weekMatchups of matchupWeeks) {
    for (const matchup of (weekMatchups ?? [])) {
      const pp: Record<string, number> = matchup.players_points ?? {};
      for (const pid of (matchup.players ?? [])) {
        (playerPointsByWeek[pid] ??= []).push(pp[pid] ?? 0);
      }
    }
  }

  // Build player value objects
  const rosteredIds = new Set<string>(rosters.flatMap((r: any) => r.players ?? []));
  const playerValues: Record<string, PlayerValue> = {};

  for (const pid of rosteredIds) {
    const meta = allPlayers[pid];
    if (!meta) continue;
    const pos: string = meta.fantasy_positions?.[0] ?? meta.position ?? '';
    if (!RELEVANT_POSITIONS.includes(pos as any)) continue;

    const pts = playerPointsByWeek[pid] ?? [];
    const totalPoints = pts.reduce((a, b) => a + b, 0);
    const gamesPlayed = pts.filter(p => p > 0).length;
    const avgPPG = gamesPlayed > 0 ? totalPoints / gamesPlayed : 0;

    playerValues[pid] = {
      playerId: pid,
      name: `${meta.first_name ?? ''} ${meta.last_name ?? ''}`.trim() || 'Unknown',
      position: pos,
      nflTeam: meta.team ?? 'FA',
      avgPPG,
      totalPoints,
      gamesPlayed,
      value: 0,
    };
  }

  // Normalize value within position (0–100 percentile)
  const byPos = groupBy(Object.values(playerValues), p => p.position);
  for (const players of Object.values(byPos)) {
    const sorted = [...players].sort((a, b) => a.avgPPG - b.avgPPG);
    sorted.forEach((p, i) => {
      playerValues[p.playerId].value = sorted.length <= 1 ? 50 : Math.round((i / (sorted.length - 1)) * 100);
    });
  }

  // Build team profiles
  const userLookup = new Map<string, any>(users.map((u: any) => [u.user_id, u]));

  const teams = rosters.map((roster: any) => {
    const user = userLookup.get(roster.owner_id);
    const teamName: string = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
    const wins: number  = roster.settings?.wins  ?? 0;
    const losses: number = roster.settings?.losses ?? 0;
    const fpts: number  = (roster.settings?.fpts ?? 0) + (roster.settings?.fpts_decimal ?? 0) / 100;

    const players = (roster.players ?? [])
      .map((pid: string) => playerValues[pid])
      .filter(Boolean) as PlayerValue[];

    const byPosition: Record<string, PlayerValue[]> = {};
    for (const pos of RELEVANT_POSITIONS) {
      byPosition[pos] = players
        .filter(p => p.position === pos)
        .sort((a, b) => b.avgPPG - a.avgPPG)
        .slice(0, 6); // top 6 per position
    }

    return {
      rosterId: roster.roster_id as number,
      teamName,
      record: `${wins}-${losses}`,
      wins,
      losses,
      fpts,
      winPct: (wins + losses) > 0 ? wins / (wins + losses) : 0.5,
      byPosition,
      allPlayers: players,
    };
  }).sort((a: any, b: any) => b.wins - a.wins || b.fpts - a.fpts);

  return { teams, playerValues, currentWeek, nflState };
}

// ── Context string for the AI ──────────────────────────────────────────────────

function buildPrompt(teams: any[], currentWeek: number): string {
  const posLines = (byPos: Record<string, PlayerValue[]>) =>
    RELEVANT_POSITIONS
      .map(pos => {
        const players = byPos[pos] ?? [];
        if (!players.length) return null;
        const names = players
          .map(p => `${p.name} (${p.nflTeam}, ${p.avgPPG.toFixed(1)} ppg)`)
          .join(' | ');
        return `  ${pos}: ${names}`;
      })
      .filter(Boolean)
      .join('\n');

  const teamSection = teams.map(t => {
    const trend = t.winPct >= 0.65 ? '🔥 HOT' : t.winPct <= 0.35 ? '❄️ COLD' : '→ MID';
    return [
      `\nTEAM: ${t.teamName} | Record: ${t.record} | ${trend} | ${t.fpts.toFixed(0)} pts scored`,
      posLines(t.byPosition),
    ].join('\n');
  }).join('\n');

  return `You are a sharp, deeply knowledgeable fantasy football analyst embedded inside a league's private dashboard. You know every roster, every trend, and every weakness in this league. Your job is to generate ${Math.min(teams.length * 2, 16)} creative, specific trade proposals for the managers.

WEEK: ${currentWeek}

${teamSection}

RULES:
- Use EXACT player names and team names from the data above — do not invent players
- Every trade must involve players from the two listed teams only
- Make rationale vivid, specific, and opinionated. Call out overperformers, underperformers, schedule context, and positional needs. No generic filler.
- Vary trade types: fair swaps, sell-high, buy-low, contender pushes, rebuilds, etc.
- Do NOT repeat the same team pair more than once
- Fairness: 50 = balanced. Lower = sideA getting robbed. Higher = sideB getting robbed.
- Tagline must be punchy, under 80 chars, no emojis

Generate proposals now.`;
}

// ── Map AI output back to typed proposals ─────────────────────────────────────

function resolveProposals(
  aiProposals: z.infer<typeof AiResponseSchema>['proposals'],
  teams: any[],
  playerValues: Record<string, PlayerValue>,
): TradeProposal[] {
  const teamByName = new Map(teams.map(t => [t.teamName.toLowerCase(), t]));

  // Build a name→PlayerValue lookup for fast matching
  const playerByName = new Map<string, PlayerValue>();
  for (const pv of Object.values(playerValues)) {
    playerByName.set(pv.name.toLowerCase(), pv);
  }

  const LABEL_VARIANT: Record<string, TradeProposal['labelVariant']> = {
    'Win-Win': 'green',
    'Sell High': 'amber',
    'Buy Low': 'blue',
    'Big Swing': 'amber',
    'Rebuild Move': 'purple',
    'Steal Alert': 'red',
    'Championship Push': 'green',
  };

  return aiProposals.flatMap((p, i) => {
    const teamA = teamByName.get(p.sideATeam.toLowerCase());
    const teamB = teamByName.get(p.sideBTeam.toLowerCase());
    if (!teamA || !teamB || teamA.rosterId === teamB.rosterId) return [];

    const resolvePlayer = (ap: z.infer<typeof AiPlayerSchema>): PlayerValue => {
      const found = playerByName.get(ap.name.toLowerCase());
      // Use AI data as fallback if player not found in values map (e.g. 0-week seasons)
      return found ?? {
        playerId: `ai-${ap.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: ap.name,
        position: ap.position,
        nflTeam: ap.nflTeam,
        avgPPG: ap.avgPPG,
        totalPoints: 0,
        gamesPlayed: 0,
        value: 50,
      };
    };

    return [{
      id: `ai-${i}-${teamA.rosterId}-${teamB.rosterId}`,
      sideA: { rosterId: teamA.rosterId, teamName: teamA.teamName, record: teamA.record, gives: p.sideAGives.map(resolvePlayer) },
      sideB: { rosterId: teamB.rosterId, teamName: teamB.teamName, record: teamB.record, gives: p.sideBGives.map(resolvePlayer) },
      label: p.label,
      labelVariant: LABEL_VARIANT[p.label] ?? 'blue',
      tagline: p.tagline,
      rationale: p.rationale,
      fairness: p.fairness,
    }];
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateTradeProposals(leagueId: string): Promise<TradeResult> {
  const { teams, playerValues, currentWeek } = await fetchLeagueContext(leagueId);

  const teamInfos: TeamInfo[] = teams.map((t: any) => ({
    rosterId: t.rosterId,
    teamName: t.teamName,
    record:   t.record,
  }));

  const prompt = buildPrompt(teams, currentWeek);

  const { object } = await generateObject({
    model: gateway('anthropic/claude-haiku-4-5'),
    schema: AiResponseSchema,
    prompt,
  });

  const proposals = resolveProposals(object.proposals, teams, playerValues);

  return { proposals, teams: teamInfos };
}

// ── Util ───────────────────────────────────────────────────────────────────────

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
