'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageLayout } from '@/components/layout/PageLayout';
import ForYouFeed from './ForYouFeed';
import InjuryReport from './InjuryReport';
import TeamFilterBar from './TeamFilterBar';
import { PulseIcon, InjuryIcon, TrendingIcon, TrendingDownIcon, GridIcon, ListIcon } from '@/components/icons/MediaIcons';

type Tab = 'foryou' | 'waivers' | 'injuries';
type TrendType = 'add' | 'drop';
type ViewMode = 'grid' | 'list';

const TABS: { id: Tab; label: string; icon: typeof PulseIcon }[] = [
  { id: 'foryou', label: 'For You', icon: PulseIcon },
  { id: 'waivers', label: 'Waiver Wire', icon: TrendingIcon },
  { id: 'injuries', label: 'Injury Report', icon: InjuryIcon },
];

// "For You" is now news + injury context only; waiver trends live in their
// own tab rather than being mixed into the main feed.
const FORYOU_KINDS = 'article,injury';
const WAIVER_KINDS = 'trending';

export default function MediaView() {
  // ?tab= lets a link open a specific tab directly.
  const params = useSearchParams();
  const requested = params.get('tab');
  const initialTab: Tab = TABS.some(t => t.id === requested) ? (requested as Tab) : 'foryou';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendType>('add');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const tabNavigation = (
    // Three equal columns on a phone so every tab is reachable without a
    // hidden horizontal scroll; the fourth tab used to start past the right
    // edge of a 390px screen and was unreachable. Back to a natural row from
    // sm up, where there is room.
    <div className="mb-4 -mx-1 grid grid-cols-3 gap-1 px-1 sm:flex sm:overflow-x-auto sm:no-scrollbar">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 font-medium transition-colors',
              // Tight enough to fit three across a narrow phone.
              'min-w-0 px-1.5 text-[11px] sm:shrink-0 sm:whitespace-nowrap sm:px-3.5 sm:text-sm',
              isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  const TREND_OPTIONS: { id: TrendType; label: string; icon: typeof TrendingIcon }[] = [
    { id: 'add', label: 'Most Added', icon: TrendingIcon },
    { id: 'drop', label: 'Most Dropped', icon: TrendingDownIcon },
  ];

  const trendToggle = (
    <div className="flex items-center gap-1 mb-4">
      {TREND_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const isActive = trend === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setTrend(opt.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof GridIcon }[] = [
    { id: 'grid', label: 'Grid', icon: GridIcon },
    { id: 'list', label: 'List', icon: ListIcon },
  ];

  const viewToggle = (
    <div className="flex items-center gap-1 mb-4">
      {VIEW_OPTIONS.map(opt => {
        const Icon = opt.icon;
        const isActive = viewMode === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setViewMode(opt.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <PageLayout
      title="Media"
      subtitle="A one-stop hub for NFL news, injuries, and waiver buzz."
    >
      {tabNavigation}

      {/* Waiver trends are league-wide by nature, they're about players on
          nobody's roster yet, so the per-team filter doesn't apply there. */}
      {activeTab !== 'waivers' && <TeamFilterBar selected={teamId} onSelect={setTeamId} />}

      {activeTab === 'foryou' && (
        <>
          {viewToggle}
          <ForYouFeed teamId={teamId ?? undefined} kinds={FORYOU_KINDS} layout={viewMode} />
        </>
      )}

      {activeTab === 'waivers' && (
        <>
          <div className="flex flex-wrap items-center gap-x-4">
            {trendToggle}
            {viewToggle}
          </div>
          <ForYouFeed kinds={WAIVER_KINDS} trend={trend} layout={viewMode} />
        </>
      )}

      {activeTab === 'injuries' && <InjuryReport teamId={teamId ?? undefined} />}

    </PageLayout>
  );
}
