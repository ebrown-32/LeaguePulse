'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PageLayout } from '@/components/layout/PageLayout';
import NewsView from './NewsView';
import ForYouFeed from './ForYouFeed';
import InjuryReport from './InjuryReport';
import TeamFilterBar from './TeamFilterBar';
import { PulseIcon, InjuryIcon, BroadcastIcon, ListIcon, ExpandIcon } from '@/components/icons/MediaIcons';

type Tab = 'foryou' | 'injuries';
type ViewMode = 'list' | 'bigpicture';

const TABS: { id: Tab; label: string; icon: typeof PulseIcon }[] = [
  { id: 'foryou', label: 'For You', icon: PulseIcon },
  { id: 'injuries', label: 'Injury Report', icon: InjuryIcon },
];

export default function MediaView() {
  const [activeTab, setActiveTab] = useState<Tab>('foryou');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [teamId, setTeamId] = useState<string | null>(null);

  const tabNavigation = (
    <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 mb-4">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const viewToggle = (
    <div className="flex items-center gap-1 mb-4">
      <button
        onClick={() => setViewMode('list')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          viewMode === 'list' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
        )}
      >
        <ListIcon className="h-3.5 w-3.5" />
        List
      </button>
      <button
        onClick={() => setViewMode('bigpicture')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
          viewMode === 'bigpicture' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground border border-transparent'
        )}
      >
        <ExpandIcon className="h-3.5 w-3.5" />
        Big Picture
      </button>
    </div>
  );

  if (activeTab === 'foryou') {
    if (viewMode === 'bigpicture') {
      return (
        <PageLayout
          title="Media"
          subtitle="A one-stop hub for NFL news, injuries, and waiver buzz."
          icon={<BroadcastIcon className="h-6 w-6 text-primary" />}
        >
          {tabNavigation}
          <TeamFilterBar selected={teamId} onSelect={setTeamId} />
          {viewToggle}
          <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
            <NewsView teamId={teamId ?? undefined} />
          </div>
        </PageLayout>
      );
    }

    return (
      <PageLayout
        title="Media"
        subtitle="A one-stop hub for NFL news, injuries, and waiver buzz."
        icon={<BroadcastIcon className="h-6 w-6 text-primary" />}
      >
        {tabNavigation}
        <TeamFilterBar selected={teamId} onSelect={setTeamId} />
        {viewToggle}
        <ForYouFeed teamId={teamId ?? undefined} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Media"
      subtitle="A one-stop hub for NFL news, injuries, and waiver buzz."
      icon={<BroadcastIcon className="h-6 w-6 text-primary" />}
    >
      {tabNavigation}
      <TeamFilterBar selected={teamId} onSelect={setTeamId} />
      <InjuryReport teamId={teamId ?? undefined} />
    </PageLayout>
  );
}
