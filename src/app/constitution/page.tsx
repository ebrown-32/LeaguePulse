import { Scroll } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { getMarkdownSections, parseLeagueSettings } from '@/lib/constitution';
import { getCurrentLeagueId } from '@/config/league';
import { getLeagueInfo } from '@/lib/api';
import ConstitutionView from './ConstitutionView';

export const dynamic = 'force-dynamic';

export default async function ConstitutionPage() {
  const { meta, sections } = getMarkdownSections();

  let leagueSettings = null;
  try {
    const leagueId  = await getCurrentLeagueId();
    const [leagueRaw, draftsRaw] = await Promise.all([
      getLeagueInfo(leagueId),
      fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`, { next: { revalidate: 3600 } })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ]);

    if (leagueRaw) {
      // Most recent draft (highest season first)
      const drafts: any[] = draftsRaw ?? [];
      const latestDraft = drafts.sort((a: any, b: any) => Number(b.season) - Number(a.season))[0];
      const draftType: string | null = latestDraft?.type ?? null;
      leagueSettings = parseLeagueSettings(leagueRaw, draftType);
    }
  } catch {
    // Render without live settings if fetch fails
  }

  return (
    <PageLayout
      title="Constitution"
      subtitle={meta.description ?? 'Rules, bylaws, and governing documents.'}
      icon={<Scroll className="h-6 w-6 text-primary" />}
    >
      <ConstitutionView
        meta={meta}
        markdownSections={sections}
        leagueSettings={leagueSettings}
      />
    </PageLayout>
  );
}
