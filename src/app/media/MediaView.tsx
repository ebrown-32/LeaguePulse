'use client';

import { useState, useEffect, useCallback } from 'react';
import { defaultAgents, type AIAgent, type AgentPost } from '@/config/aiAgents';
import NewsView from './NewsView';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  HeartIcon,
  ArrowPathRoundedSquareIcon,
  ChatBubbleLeftIcon,
  CheckBadgeIcon,
  SparklesIcon,
  NewspaperIcon,
  UserGroupIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import { 
  HeartIcon as HeartSolidIcon 
} from '@heroicons/react/24/solid';

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
    const colors = {
      'analysis': 'text-blue-400',
      'prediction': 'text-purple-400', 
      'power-ranking': 'text-green-400',
      'matchup': 'text-orange-400',
      'news': 'text-red-400',
      'hot-take': 'text-red-400',
      'general': 'text-gray-400'
    };
    return colors[type] || 'text-gray-400';
  };

  const tabNavigation = (
    <div className="flex space-x-8 mb-6">
      <button
        onClick={() => setActiveTab('news')}
        className={`pb-3 border-b-2 transition-colors font-medium ${
          activeTab === 'news'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <NewspaperIcon className="h-4 w-4" />
          <span>NFL News</span>
        </div>
      </button>
      <button
        onClick={() => setActiveTab('social')}
        className={`pb-3 border-b-2 transition-colors font-medium ${
          activeTab === 'social'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <UserGroupIcon className="h-4 w-4" />
          <span>Social Feed</span>
        </div>
      </button>
    </div>
  );

  if (activeTab === 'news') {
    return (
      <PageLayout
        title="Media"
        subtitle="Latest NFL news and your league's AI-powered social feed"
        icon={<PhotoIcon className="h-6 w-6 text-gray-400" />}
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
        subtitle="Latest NFL news and your league's AI-powered social feed"
        icon={<PhotoIcon className="h-6 w-6 text-gray-400" />}
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
      subtitle="Latest NFL news and your league's AI-powered social feed"
      icon={<PhotoIcon className="h-6 w-6 text-gray-400" />}
    >
      {tabNavigation}

      {/* Social Feed Content */}
      <div className="space-y-6">
        {posts.length === 0 && !loading ? (
          <div className="text-center py-16 px-4">
            <SparklesIcon className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
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
                  className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg dark:hover:bg-gray-800/70 transition-all duration-200"
                >
                  {/* Agent Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <div className="text-2xl">{agent.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 dark:text-white truncate">{agent.name}</h3>
                        {agent.verified && (
                          <CheckBadgeIcon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        )}
                        <span className="text-gray-500 dark:text-gray-400 truncate">{agent.username}</span>
                        <span className="text-gray-400 dark:text-gray-500">·</span>
                        <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {formatTimeAgo(post.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 ${getPostTypeColor(post.type)} border border-gray-200 dark:border-gray-600`}>
                          {post.type.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="ml-11">
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-4 whitespace-pre-wrap">
                      {post.content}
                    </p>

                    {/* Hashtags */}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {post.hashtags.map((hashtag, index) => (
                          <span key={index} className="text-blue-500 dark:text-blue-400 text-sm hover:text-blue-600 dark:hover:text-blue-300">
                            {hashtag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Engagement Stats */}
                    <div className="flex items-center gap-6 text-gray-500 dark:text-gray-400 text-sm">
                      <div className="flex items-center gap-1 group cursor-default">
                        <ChatBubbleLeftIcon className="h-4 w-4 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                        <span className="group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                          {post.replies}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 group cursor-default">
                        <ArrowPathRoundedSquareIcon className="h-4 w-4 group-hover:text-green-500 dark:group-hover:text-green-400 transition-colors" />
                        <span className="group-hover:text-green-500 dark:group-hover:text-green-400 transition-colors">
                          {post.retweets}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 group cursor-default">
                        <HeartIcon className="h-4 w-4 group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors" />
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
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
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