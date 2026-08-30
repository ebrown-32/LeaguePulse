import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPosts, getLikes } from '@/lib/ai/store';
import { getTheme } from '@/lib/themeStorage';
import SinglePostView from './SinglePostView';

export const dynamic = 'force-dynamic';

/**
 * One post, on its own page.
 *
 * This is what a share links to. Dropping a reader at the top of the whole
 * feed meant they had to hunt for the thing they were sent, and by the next
 * day it had moved. A permalink also gives link previews something specific to
 * unfurl, which is what makes a pasted link look like anything at all.
 */
async function findPost(id: string) {
  return (await getPosts(100)).find(p => p.id === id) ?? null;
}

/** The post's own words, trimmed for a preview card. */
function summarise(content: any): string {
  const text = content?.text || content?.standfirst || content?.headline || '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 179).trimEnd()}...` : clean;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const [post, theme] = await Promise.all([findPost(id), getTheme()]);
  if (!post) return { title: 'Post not found' };

  const league = theme.leagueName?.trim() || theme.siteTitle?.trim() || 'LeaguePulse';
  const title = `${post.personaName} ${post.personaHandle}`;
  const description = summarise(post.content) || `On the ${league} feed.`;

  return {
    title: `${title} | ${league}`,
    description,
    // Given to the chat apps that unfurl links, so a shared post arrives as a
    // card with the writer and their words rather than as a bare URL.
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: league,
      publishedTime: post.createdAt,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, theme] = await Promise.all([findPost(id), getTheme()]);
  if (!post) notFound();

  const likes = await getLikes([post.id]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-16 sm:px-6 md:pb-8 lg:px-8">
      <Link
        href="/desk"
        className="inline-flex min-h-[44px] items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        The Feed
      </Link>
      <div className="mt-2 border-t border-border">
        <SinglePostView
          post={post as any}
          realLikes={likes[post.id] ?? 0}
          leagueName={theme.leagueName ?? theme.siteTitle ?? null}
        />
      </div>
    </div>
  );
}
