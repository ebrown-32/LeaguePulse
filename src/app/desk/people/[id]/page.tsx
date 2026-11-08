import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { getLikes, getPersonalities, getPosts } from '@/lib/ai/store';
import { personaAvatarUrl } from '@/lib/ai/avatar';
import { getTheme } from '@/lib/themeStorage';
import ProfilePosts from './ProfilePosts';

export const dynamic = 'force-dynamic';

/**
 * A Desk personality's profile: who they are (their face, handle, tagline and the character the
 * league's admin wrote for them), what they cover, the episodes of The Desk Weekly they've hosted,
 * and everything of theirs still on The Feed, newest first.
 *
 * The Feed keeps its latest hundred posts, so the history here is what's still in it. A
 * personality the admin deleted has no profile; one switched off keeps theirs (their posts are
 * still up), marked as off the desk.
 */

const KIND_LABEL: Record<string, string> = {
  article: 'Columns', tweet: 'Takes', comment: 'Replies', tradeGrade: 'Trade grades', powerRankings: 'Power rankings',
  predictions: 'Predictions', matchupPreview: 'Week previews', kickoff: 'Kickoff', liveTake: 'Live takes',
};

async function load(id: string) {
  const [people, posts] = await Promise.all([getPersonalities(), getPosts(100)]);
  const person = people.find(p => p.id === id && !p.hidden) ?? null;
  const mine = posts.filter(p => p.personalityId === id);
  return { person, mine };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [{ person }, theme] = await Promise.all([load(decodeURIComponent(id)), getTheme()]);
  if (!person) return { title: 'Not found' };
  const league = theme.leagueName?.trim() || theme.siteTitle?.trim() || 'LeaguePulse';
  return {
    title: `${person.name} ${person.handle} | ${league}`,
    description: person.tagline,
    openGraph: { title: `${person.name} ${person.handle}`, description: person.tagline, images: [personaAvatarUrl(person, { size: 256 })] },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const [{ person, mine }, theme] = await Promise.all([load(id), getTheme()]);
  if (!person) notFound();

  const [likes, episodes] = await Promise.all([
    getLikes(mine.map(p => p.id)),
    import('@/lib/ai/podcast').then(m => m.listEpisodes()).catch(() => []),
  ]);
  const hosted = episodes.filter(e => e.hosts.some(h => h.id === person.id));
  const totalLikes = mine.reduce((n, p) => n + (likes[p.id] ?? 0), 0);
  const fan = (person.type ?? 'media') === 'fan';
  const avatar = personaAvatarUrl(person, { size: 256 });
  const covers = person.kinds.filter(k => k !== 'comment').map(k => KIND_LABEL[k]).filter(Boolean);
  const stats = [
    { label: 'Posts', value: mine.filter(p => !p.replyTo).length },
    { label: 'Replies', value: mine.filter(p => p.replyTo).length },
    { label: 'Likes', value: totalLikes },
    { label: 'Episodes', value: hosted.length },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-16 sm:px-6 md:pb-8 lg:px-8">
      <Link href="/desk" className="inline-flex min-h-[44px] items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        The Feed
      </Link>

      <section className="lp-surface relative mt-2 overflow-hidden rounded-2xl">
        {/* A banner in the league's colour. */}
        <div aria-hidden className="h-24 bg-gradient-to-br from-primary/80 via-primary/40 to-primary/10 sm:h-28" />
        <div className="px-5 pb-5 sm:px-7 sm:pb-6">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" width={112} height={112} className="h-24 w-24 rounded-full bg-card object-cover ring-4 ring-card sm:h-28 sm:w-28" />
            {!person.enabled && <span className="mb-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Off the desk</span>}
          </div>
          <h1 className={`mt-3 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[30px] ${person.accent}`}>{person.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
            {person.handle}
            <span className="rounded bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{fan ? 'Fan' : 'Desk writer'}</span>
          </p>
          <p className="mt-3 text-[15.5px] font-medium leading-snug text-foreground">{person.tagline}</p>

          <dl className="mt-5 grid grid-cols-4 gap-2 border-t border-border pt-4">
            {stats.map(s => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[11px] font-semibold text-muted-foreground">{s.label}</dt>
                <dd className="lp-num mt-0.5 font-display text-[22px] font-extrabold tabular-nums leading-none text-foreground">{s.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="lp-surface rounded-2xl p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">About</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-foreground/90">{person.voice}</p>
        </div>
        <div className="lp-surface rounded-2xl p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{fan ? 'Shows up for' : 'Covers'}</h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(covers.length ? covers : ['Replies']).map(k => <li key={k} className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary">{k}</li>)}
          </ul>
          {hosted.length > 0 && (
            <>
              <h2 className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">On The Desk Weekly</h2>
              <ul className="mt-2 space-y-1.5">
                {hosted.slice(0, 5).map(e => (
                  <li key={e.id}>
                    <Link href={`/podcast?ep=${encodeURIComponent(e.id)}&w=${e.week}`} className="group flex items-center gap-2.5 rounded-lg p-1.5 -mx-1.5 hover:bg-muted/60">
                      <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 text-primary">
                        <span className="text-[7px] font-bold uppercase tracking-widest">Wk</span>
                        <span className="font-display text-[14px] font-black leading-none">{e.week}</span>
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-semibold text-foreground group-hover:text-primary">{e.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 font-display text-[18px] font-extrabold text-foreground">Recent posts</h2>
        {mine.length ? (
          <div className="lp-surface overflow-hidden rounded-2xl">
            <ProfilePosts posts={mine} likes={likes} leagueName={theme.leagueName ?? null} />
          </div>
        ) : (
          <p className="lp-surface rounded-2xl px-5 py-8 text-center text-[14px] text-muted-foreground">Nothing on The Feed from {person.name} right now. Check back after the next round of posts.</p>
        )}
      </section>
    </div>
  );
}
