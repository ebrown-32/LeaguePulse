'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ChevronRight, BookOpen, Zap } from 'lucide-react';
import type { ConstitutionMeta, ConstitutionSection, LeagueSettings } from '@/lib/constitution';

// ── Helpers ───────────────────────────────────────────────────────────────────

function highlight(text: string, query: string): string {
  if (!query.trim()) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>');
}

const LEAGUE_TYPE_LABELS: Record<number, string> = {
  0: 'Redraft',
  1: 'Keeper',
  2: 'Dynasty',
};

const DRAFT_TYPE_LABELS: Record<string, string> = {
  snake:   'Snake (order reverses each round)',
  linear:  'Linear (same order each round)',
  auction: 'Auction',
};

const WAIVER_LABELS: Record<number, string> = {
  0: 'Rolling (inverse standings)',
  1: 'Free Agent Acquisition Budget (FAAB)',
  2: 'Free agents (no waiver period)',
};

const WAIVER_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatYards(value: number): string {
  if (value === 0) return '0';
  const per = Math.round(1 / value);
  return `${(value * per).toFixed(0)} pt / ${per} yds`;
}

function fmtPts(v: number): string {
  if (v === 0) return '0';
  return v > 0 ? `+${v % 1 === 0 ? v : v.toFixed(2)}` : String(v % 1 === 0 ? v : v.toFixed(2));
}

// ── Auto section: Membership ──────────────────────────────────────────────────

function MembershipSection({ s }: { s: LeagueSettings }) {
  return (
    <AutoSection id="membership" title="Membership">
      <Row label="Teams"        value={String(s.numTeams)} />
      <Row label="League type"  value={LEAGUE_TYPE_LABELS[s.leagueType] ?? String(s.leagueType)} />
      <Row label="Season"       value={s.season} />
      {s.leagueAverageMatch && <Row label="Median matchup" value="Enabled — each team also plays the weekly median score" />}
    </AutoSection>
  );
}

// ── Auto section: Roster ──────────────────────────────────────────────────────

function RosterSection({ s }: { s: LeagueSettings }) {
  const starters = s.rosterPositions.filter(p => p !== 'BN' && p !== 'IR');
  const bench    = s.rosterPositions.filter(p => p === 'BN').length;
  const ir       = s.rosterPositions.filter(p => p === 'IR').length;

  // Count each position type
  const posCounts: Record<string, number> = {};
  for (const p of starters) posCounts[p] = (posCounts[p] ?? 0) + 1;

  const posOrder = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'WRRB_FLEX', 'SUPER_FLEX', 'K', 'DEF', 'DL', 'LB', 'DB'];
  const posLabel: Record<string, string> = {
    FLEX: 'FLEX (RB/WR/TE)', WRRB_FLEX: 'FLEX (WR/RB)', SUPER_FLEX: 'Super FLEX',
    K: 'Kicker', DEF: 'Defense / ST',
  };
  const sorted = posOrder.filter(p => posCounts[p]).concat(
    Object.keys(posCounts).filter(p => !posOrder.includes(p))
  );

  return (
    <AutoSection id="roster-lineup" title="Roster & Lineup">
      <SubHeading>Starter Slots</SubHeading>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {sorted.map(pos => (
          <div key={pos} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-foreground font-medium">{posLabel[pos] ?? pos}</span>
            <span className="font-mono text-primary font-semibold">×{posCounts[pos]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Chip label="Bench spots"  value={String(bench)} />
        {s.reserveSlots > 0  && <Chip label="IR slots"    value={String(s.reserveSlots)} />}
        {s.taxiSlots > 0     && <Chip label="Taxi squad"  value={`${s.taxiSlots} slots`} />}
        {s.taxiDeadline > 0  && <Chip label="Taxi deadline" value={`Week ${s.taxiDeadline}`} />}
        <Chip label="Total roster" value={String(s.rosterPositions.filter(p => p !== 'IR').length + s.reserveSlots)} />
      </div>
    </AutoSection>
  );
}

// ── Auto section: Scoring ─────────────────────────────────────────────────────

const SCORING_GROUPS: { label: string; rows: { key: string; label: string; yard?: boolean }[] }[] = [
  {
    label: 'Passing',
    rows: [
      { key: 'pass_td',  label: 'Passing TD' },
      { key: 'pass_yd',  label: 'Passing Yards', yard: true },
      { key: 'pass_int', label: 'Interception thrown' },
      { key: 'pass_2pt', label: '2-Pt Conversion (passing)' },
      { key: 'pass_sack', label: 'Sack taken' },
    ],
  },
  {
    label: 'Rushing',
    rows: [
      { key: 'rush_td',  label: 'Rushing TD' },
      { key: 'rush_yd',  label: 'Rushing Yards', yard: true },
      { key: 'rush_2pt', label: '2-Pt Conversion (rushing)' },
    ],
  },
  {
    label: 'Receiving',
    rows: [
      { key: 'rec',      label: 'Reception (PPR)' },
      { key: 'rec_td',   label: 'Receiving TD' },
      { key: 'rec_yd',   label: 'Receiving Yards', yard: true },
      { key: 'rec_2pt',  label: '2-Pt Conversion (receiving)' },
      { key: 'bonus_rec_te', label: 'TE Reception Bonus' },
    ],
  },
  {
    label: 'Misc / Penalties',
    rows: [
      { key: 'fum_lost', label: 'Fumble Lost' },
      { key: 'fum',      label: 'Fumble (any)' },
    ],
  },
  {
    label: 'Kicker',
    rows: [
      { key: 'fgm_0_19',  label: 'FG 0–19 yds' },
      { key: 'fgm_20_29', label: 'FG 20–29 yds' },
      { key: 'fgm_30_39', label: 'FG 30–39 yds' },
      { key: 'fgm_40_49', label: 'FG 40–49 yds' },
      { key: 'fgm_50p',   label: 'FG 50+ yds' },
      { key: 'xpm',       label: 'Extra Point Made' },
      { key: 'fgmiss',    label: 'FG Missed' },
    ],
  },
  {
    label: 'Defense / Special Teams',
    rows: [
      { key: 'def_td',   label: 'Defensive TD' },
      { key: 'sack',     label: 'Sack' },
      { key: 'int',      label: 'Interception' },
      { key: 'fum_rec',  label: 'Fumble Recovery' },
      { key: 'safe',     label: 'Safety' },
      { key: 'blk_kick', label: 'Blocked Kick' },
      { key: 'pts_allow_0',    label: 'Points Allowed: 0' },
      { key: 'pts_allow_1_6',  label: 'Points Allowed: 1–6' },
      { key: 'pts_allow_7_13', label: 'Points Allowed: 7–13' },
      { key: 'pts_allow_14_20',label: 'Points Allowed: 14–20' },
      { key: 'pts_allow_21_27',label: 'Points Allowed: 21–27' },
      { key: 'pts_allow_28_34',label: 'Points Allowed: 28–34' },
      { key: 'pts_allow_35p',  label: 'Points Allowed: 35+' },
    ],
  },
];

function ScoringSection({ s }: { s: LeagueSettings }) {
  const rec = s.scoringSettings['rec'] ?? 0;
  const pprLabel = rec === 1 ? 'Full PPR' : rec === 0.5 ? 'Half PPR' : rec === 0 ? 'Standard (no PPR)' : `${rec} PPR`;

  return (
    <AutoSection id="scoring" title="Scoring System">
      <div className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
        <Zap className="h-3 w-3" />
        {pprLabel}
      </div>
      <div className="space-y-4">
        {SCORING_GROUPS.map(group => {
          const visible = group.rows.filter(r => s.scoringSettings[r.key] !== undefined && s.scoringSettings[r.key] !== 0);
          if (!visible.length) return null;
          return (
            <div key={group.label}>
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{group.label}</div>
              <div className="rounded-lg border border-border overflow-hidden">
                {visible.map((row, i) => {
                  const v = s.scoringSettings[row.key];
                  const formatted = row.yard ? formatYards(v) : fmtPts(v);
                  const isNeg = v < 0;
                  return (
                    <div key={row.key} className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 === 1 ? 'bg-muted/25' : ''}`}>
                      <span className="text-foreground/80">{row.label}</span>
                      <span className={`font-mono font-semibold tabular-nums ${isNeg ? 'text-red-500' : 'text-primary'}`}>
                        {formatted}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AutoSection>
  );
}

// ── Auto section: Schedule & Playoffs ────────────────────────────────────────

function ScheduleSection({ s }: { s: LeagueSettings }) {
  const regularSeasonWeeks = s.playoffWeekStart > 0 ? s.playoffWeekStart - 1 : null;
  const playoffRounds = s.playoffTeams > 0 ? Math.ceil(Math.log2(s.playoffTeams)) : null;

  return (
    <AutoSection id="schedule-playoffs" title="Schedule & Playoffs">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {regularSeasonWeeks && <Chip label="Regular season" value={`Wks 1–${regularSeasonWeeks}`} />}
        {s.playoffWeekStart > 0 && <Chip label="Playoffs begin"  value={`Week ${s.playoffWeekStart}`} />}
        {s.playoffTeams > 0     && <Chip label="Playoff teams"   value={String(s.playoffTeams)} />}
        {playoffRounds          && <Chip label="Playoff rounds"  value={String(playoffRounds)} />}
        {s.tradeDeadline > 0   && <Chip label="Trade deadline"  value={`After Week ${s.tradeDeadline}`} />}
      </div>
      {s.tradeReviewDays > 0   && <Row label="Trade review window" value={`${s.tradeReviewDays} day${s.tradeReviewDays !== 1 ? 's' : ''}`} />}
      {s.vetoVotesNeeded > 0   && <Row label="Votes to veto a trade" value={String(s.vetoVotesNeeded)} />}
    </AutoSection>
  );
}

// ── Auto section: Draft ───────────────────────────────────────────────────────

function DraftSection({ s }: { s: LeagueSettings }) {
  const isDynasty = s.leagueType === 2;
  return (
    <AutoSection id="draft" title={isDynasty ? 'Rookie Draft' : 'Draft'}>
      {s.draftType  && <Row label="Format"        value={DRAFT_TYPE_LABELS[s.draftType] ?? s.draftType} />}
      {s.draftRounds > 0 && <Row label="Rounds"  value={String(s.draftRounds)} />}
      <Row label="Pick trading" value={s.pickTrading ? 'Enabled' : 'Disabled'} />
      {!isDynasty && s.maxKeepers > 0 && (
        <Row label="Keepers" value={`${s.maxKeepers} per team`} />
      )}
    </AutoSection>
  );
}

// ── Auto section: Waivers ─────────────────────────────────────────────────────

function WaiverSection({ s }: { s: LeagueSettings }) {
  const isFaab = s.waiverType === 1;
  return (
    <AutoSection id="waivers" title="Waivers & Free Agency">
      <Row label="Waiver system"  value={WAIVER_LABELS[s.waiverType] ?? String(s.waiverType)} />
      {isFaab && s.waiverBudget > 0 && <Row label="FAAB budget"    value={`$${s.waiverBudget}`} />}
      {s.waiverDayOfWeek >= 0       && <Row label="Process day"    value={WAIVER_DAYS[s.waiverDayOfWeek] ?? ''} />}
    </AutoSection>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function AutoSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3 flex items-center gap-2">
        {title}
      </h2>
      <div className="h-px bg-border mb-4" />
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{children}</div>;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}

// ── Markdown section block ────────────────────────────────────────────────────

function SectionBlock({ section, query }: { section: ConstitutionSection; query: string }) {
  const titleHtml   = highlight(section.title, query);
  const contentHtml = query.trim() ? highlight(section.html, query) : section.html;

  const headingClass =
    section.level === 2
      ? 'text-xl font-semibold text-foreground mt-8 mb-3 flex items-center gap-2'
      : 'text-base font-semibold text-foreground/80 mt-6 mb-2 pl-1';

  const Tag = section.level === 2 ? 'h2' : 'h3';

  return (
    <section id={section.id} className="scroll-mt-24">
      <Tag className={headingClass} dangerouslySetInnerHTML={{ __html: titleHtml }} />
      {section.level === 2 && <div className="h-px bg-border mb-4" />}
      <div className="prose-section" dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </section>
  );
}

// ── ToC ───────────────────────────────────────────────────────────────────────

interface TocItem { id: string; title: string; level: number }

function TableOfContents({ items, activeId, onNavigate }: {
  items: TocItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {items.map(item => {
        const isActive = activeId === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full text-left flex items-start gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            } ${item.level === 3 ? 'pl-6' : ''}`}
          >
            {isActive && <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            <span className={isActive ? '' : item.level === 3 ? '' : 'pl-[1.125rem]'}>{item.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface Props {
  meta: ConstitutionMeta;
  markdownSections: ConstitutionSection[];
  leagueSettings: LeagueSettings | null;
}

function buildAutoToc(s: LeagueSettings): TocItem[] {
  return [
    { id: 'membership',        title: 'Membership',            level: 2 },
    { id: 'roster-lineup',     title: 'Roster & Lineup',       level: 2 },
    { id: 'scoring',           title: 'Scoring System',        level: 2 },
    { id: 'schedule-playoffs', title: 'Schedule & Playoffs',   level: 2 },
    { id: 'draft',             title: s.leagueType === 2 ? 'Rookie Draft' : 'Draft', level: 2 },
    { id: 'waivers',           title: 'Waivers & Free Agency', level: 2 },
  ];
}

export default function ConstitutionView({ meta, markdownSections, leagueSettings }: Props) {
  const [query,    setQuery]   = useState('');
  const [activeId, setActive]  = useState('');
  const [tocOpen,  setTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const mdTocItems: TocItem[] = markdownSections
    .filter(s => s.level <= 2)
    .map(s => ({ id: s.id, title: s.title, level: s.level }));

  const tocItems: TocItem[] = leagueSettings
    ? [...buildAutoToc(leagueSettings), ...mdTocItems]
    : mdTocItems;

  const filteredMd = query.trim()
    ? markdownSections.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.text.toLowerCase().includes(query.toLowerCase())
      )
    : markdownSections;

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  }, []);

  useEffect(() => {
    observerRef.current?.disconnect();
    const els = contentRef.current?.querySelectorAll('section[id]') ?? [];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    els.forEach(el => obs.observe(el));
    observerRef.current = obs;
    return () => obs.disconnect();
  }, [query, leagueSettings]);

  return (
    <div className="flex gap-8 items-start">
      {/* Sidebar ToC — desktop */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-3">Contents</div>
        <TableOfContents items={tocItems} activeId={activeId} onNavigate={scrollTo} />
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">

        {/* Header */}
        <div className="mb-8 pb-6 border-b border-border">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Official Document</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            {leagueSettings?.name ?? 'League Constitution'}
          </h1>
          {meta.description && <p className="text-muted-foreground text-sm">{meta.description}</p>}
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
            <span>Version {meta.version}</span>
            {meta.lastUpdated && (
              <span>Last updated {new Date(meta.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            )}
            {leagueSettings && <span>{leagueSettings.season} season</span>}
          </div>
        </div>

        {/* Search + mobile ToC */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search the constitution…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setTocOpen(o => !o)}
            className="lg:hidden px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition"
          >
            Contents
          </button>
        </div>

        {/* Mobile ToC */}
        {tocOpen && (
          <div className="lg:hidden mb-6 rounded-xl border border-border bg-card p-4">
            <TableOfContents items={tocItems} activeId={activeId} onNavigate={scrollTo} />
          </div>
        )}

        {query.trim() && (
          <p className="text-xs text-muted-foreground mb-4">
            {filteredMd.length === 0
              ? 'No results in custom sections.'
              : `${filteredMd.length} section${filteredMd.length !== 1 ? 's' : ''} match "${query}"`}
          </p>
        )}

        {/* Content */}
        <div ref={contentRef} className="space-y-0">
          {/* Auto sections from Sleeper — hidden during search */}
          {leagueSettings && !query.trim() && (
            <>
              <MembershipSection  s={leagueSettings} />
              <RosterSection      s={leagueSettings} />
              <ScoringSection     s={leagueSettings} />
              <ScheduleSection    s={leagueSettings} />
              <DraftSection       s={leagueSettings} />
              <WaiverSection      s={leagueSettings} />
            </>
          )}

          {/* Markdown custom sections */}
          {filteredMd.map(section => (
            <SectionBlock key={section.id} section={section} query={query} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
          <p>{leagueSettings?.name ?? 'League'}, Constitution v{meta.version}</p>
          <p>Amendments require a 3/4 majority vote of the active membership.</p>
        </div>
      </div>
    </div>
  );
}
