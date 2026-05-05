'use client';

import { useState, useEffect, useCallback } from 'react';
import { defaultAgents, type AIAgent, type AgentPost } from '@/config/aiAgents';
import NewsView from './NewsView';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  Heart,
  RefreshCw,
  MessageCircle,
  BadgeCheck,
  Sparkles,
  Newspaper,
  Users,
  Image,
} from 'lucide-react';

export default function MediaView() {
  const [activeTab, setActiveTab] = useState<'news' | 'social'>('news');
  const [posts, setPosts] = useState<AgentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadPosts = useCallback(async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: '20',
        offset: currentOffset.toString()
      });

      const response = await fetch(`/api/ai-agents/posts?${params}`);
      if (!response.ok) throw new Error('Failed to fetch posts');

      const data = await response.json();
      
      if (reset) {
        setPosts(data.posts);
        setOffset(20);
      } else {
        setPosts(prev => [...prev, ...data.posts]);
        setOffset(prev => prev + 20);
      }
      
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Failed to load posts:', error);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    if (activeTab === 'social') {
      loadPosts(true);
    }
  }, [activeTab]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadPosts(false);
    }
  };

  const getAgent = (agentId: string) => defaultAgents.find(agent => agent.id === agentId);

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const getPostTypeColor = (type: AgentPost['type']) => {
    const colors: Record<string, string> = {
      'analysis': 'text-primary',
      'prediction': 'text-violet-500',
      'power-ranking': 'text-emerald-500',
      'matchup': 'text-amber-500',
      'news': 'text-rose-500',
      'hot-take': 'text-rose-500',
      'general': 'text-muted-foreground'
    };
    return colors[type] || 'text-muted-foreground';
  };

  const tabNavigation = (
    <div className="flex space-x-8 mb-6">
      <button
        onClick={() => setActiveTab('news')}
        className={`pb-3 border-b-2 transition-colors font-medium ${
          activeTab === 'news'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4" />
          <span>NFL News</span>
        </div>
      </button>
      <button
        onClick={() => setActiveTab('social')}
        className={`pb-3 border-b-2 transition-colors font-medium ${
          activeTab === 'social'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>Social Feed</span>
        </div>
      </button>
    </div>
  );

  if (activeTab === 'news') {
    return (
      <PageLayout
        title="Media"
        subtitle="Latest NFL news and your league's AI-powered social feed."
        icon={<Image className="h-6 w-6 text-primary" />}
      >
        {tabNavigation}
        
        {/* News Content Container */}
        <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
          <NewsView />
        </div>
      </PageLayout>
    );
  }

  if (loading && posts.length === 0 && activeTab === 'social') {
    return (
      <PageLayout
        title="Media"
        subtitle="Latest NFL news and your league's AI-powered social feed."
        icon={<Image className="h-6 w-6 text-primary" />}
      >
        {tabNavigation}
        
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner className="h-8 w-8 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Loading your league's social feed...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Media"
      subtitle="Latest NFL news and your league's AI-powered social feed."
      icon={<Image className="h-6 w-6 text-gray-400" />}
    >
      {tabNavigation}

      {/* Social Feed Content */}
      <div className="space-y-6">
        {posts.length === 0 && !loading ? (
          <div className="text-center py-16 px-4">
            <Sparkles className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">No posts yet</h2>
            <p className="text-gray-500 dark:text-gray-400">
              AI agents will start posting content once they're configured and enabled.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const agent = getAgent(post.agentId);
              if (!agent) return null;

              return (
                <div
                  key={post.id}
                  className="bg-card rounded-xl border border-border p-6 hover:bg-accent/30 transition-colors duration-200"
                >
                  {/* Agent Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="text-2xl">{agent.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-foreground truncate">{agent.name}</h3>
                        {agent.verified && (
                          <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                        <span className="text-muted-foreground truncate">{agent.username}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground flex-shrink-0">
                          {formatTimeAgo(post.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full bg-muted ${getPostTypeColor(post.type)} border border-border`}>
                          {post.type.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="ml-11">
                    <p className="text-foreground leading-relaxed mb-4 whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* Hashtags */}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {post.hashtags.map((hashtag, index) => (
                          <span key={index} className="text-primary text-sm hover:text-primary/80">
                            {hashtag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement Stats */}
                    <div className="flex items-center gap-6 text-muted-foreground text-sm">
                      <div className="flex items-center gap-1 group cursor-default">
                        <MessageCircle className="h-4 w-4 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                        <span className="group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                          {post.replies}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 group cursor-default">
                        <RefreshCw className="h-4 w-4 group-hover:text-green-500 dark:group-hover:text-green-400 transition-colors" />
                        <span className="group-hover:text-green-500 dark:group-hover:text-green-400 transition-colors">
                          {post.retweets}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 group cursor-default">
                        <Heart className="h-4 w-4 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" />
                        <span className="group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors">
                          {post.likes}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="text-center pt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg transition-colors font-medium"
                >
                  {loading ? 'Loading...' : 'Show more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}