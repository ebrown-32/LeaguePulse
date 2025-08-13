'use client';

import { useState, useEffect, useCallback } from 'react';
import { defaultAgents, type AIAgent, type AgentPost } from '@/config/aiAgents';
import TwitterFeed from './components/TwitterFeed';
import TwitterSidebar from './components/TwitterSidebar';
import TweetComposer from './components/TweetComposer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AgentsView() {
  const [agents, setAgents] = useState<AIAgent[]>(defaultAgents);
  const [posts, setPosts] = useState<AgentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'home' | 'trending' | 'agents'>('home');
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const loadPosts = useCallback(async (reset = false) => {
    try {
      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: '20',
        offset: currentOffset.toString(),
        ...(selectedTab === 'trending' && { trending: 'true' })
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
  }, [offset, selectedTab]);

  useEffect(() => {
    setLoading(true);
    setOffset(0);
    loadPosts(true);
  }, [selectedTab]);

  const handleAgentToggle = (agentId: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, enabled: !agent.enabled }
        : agent
    ));
  };

  const handleGenerateContent = async (agentId: string, type: AgentPost['type']) => {
    try {
      // Use the intelligent content generator
      const leagueId = process.env.NEXT_PUBLIC_LEAGUE_ID || 'demo_league';
      
      const response = await fetch('/api/ai-agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, type, leagueId })
      });

      if (!response.ok) throw new Error('Failed to generate content');

      const data = await response.json();
      if (data.post) {
        setPosts(prev => [data.post, ...prev]);
      }
    } catch (error) {
      console.error('Failed to generate content:', error);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      // Optimistic update
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, likes: post.likes + 1 }
          : post
      ));

      // Update on server
      const response = await fetch(`/api/ai-agents/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          likes: posts.find(p => p.id === postId)!.likes + 1 
        })
      });

      if (!response.ok) {
        // Revert on error
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, likes: post.likes - 1 }
            : post
        ));
      }
    } catch (error) {
      console.error('Failed to update like:', error);
    }
  };

  const handleRetweet = async (postId: string) => {
    try {
      // Optimistic update
      setPosts(prev => prev.map(post =>
        post.id === postId
          ? { ...post, retweets: post.retweets + 1 }
          : post
      ));

      // Update on server
      const response = await fetch(`/api/ai-agents/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          retweets: posts.find(p => p.id === postId)!.retweets + 1 
        })
      });

      if (!response.ok) {
        // Revert on error
        setPosts(prev => prev.map(post =>
          post.id === postId
            ? { ...post, retweets: post.retweets - 1 }
            : post
        ));
      }
    } catch (error) {
      console.error('Failed to update retweet:', error);
    }
  };

  const enabledAgents = agents.filter(agent => agent.enabled);
  const filteredPosts = posts.filter(post => {
    if (selectedTab === 'home') return true;
    if (selectedTab === 'trending') return post.likes > 5 || post.retweets > 2;
    return true;
  });

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LoadingSpinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Twitter-like Layout */}
      <div className="max-w-6xl mx-auto flex">
        {/* Left Sidebar */}
        <TwitterSidebar 
          agents={agents}
          onAgentToggle={handleAgentToggle}
          selectedTab={selectedTab}
          onTabChange={setSelectedTab}
        />

        {/* Main Feed */}
        <div className="flex-1 border-x border-gray-800 min-h-screen max-w-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-gray-800">
            <div className="p-4">
              <h1 className="text-xl font-bold">
                {selectedTab === 'home' && 'Home'}
                {selectedTab === 'trending' && 'Trending'}
                {selectedTab === 'agents' && 'AI Agents'}
              </h1>
              <div className="flex space-x-8 mt-4">
                {[
                  { key: 'home', label: 'For you' },
                  { key: 'trending', label: 'Trending' },
                  { key: 'agents', label: 'Agents' }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setSelectedTab(tab.key as 'home' | 'trending' | 'agents')}
                    className={`
                      pb-3 border-b-2 transition-colors font-medium
                      ${selectedTab === tab.key 
                        ? 'border-blue-500 text-white' 
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tweet Composer */}
          <TweetComposer
            agents={enabledAgents}
            onGenerateContent={handleGenerateContent}
          />

          {/* Feed */}
          <TwitterFeed
            posts={filteredPosts}
            agents={agents}
            onLike={handleLike}
            onRetweet={handleRetweet}
            selectedTab={selectedTab}
            hasMore={hasMore}
            onLoadMore={() => loadPosts(false)}
            loading={loading}
          />
        </div>

        {/* Right Sidebar - Trending & Suggestions */}
        <div className="w-80 p-4 hidden lg:block">
          <div className="space-y-4">
            {/* League Info */}
            <div className="bg-gray-900 rounded-2xl p-4">
              <h2 className="text-xl font-bold mb-3">League Stats</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Posts:</span>
                  <span className="text-blue-400">{posts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Agents:</span>
                  <span className="text-green-400">{enabledAgents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>League ID:</span>
                  <span className="text-gray-400 text-xs">
                    {process.env.NEXT_PUBLIC_LEAGUE_ID?.slice(0, 8) || 'demo'}...
                  </span>
                </div>
              </div>
            </div>

            {/* Trending Topics */}
            <div className="bg-gray-900 rounded-2xl p-4">
              <h2 className="text-xl font-bold mb-3">Trending in Fantasy Football</h2>
              <div className="space-y-3">
                {[
                  { topic: '#FantasyFootball', posts: '12.3K Tweets' },
                  { topic: '#WaiverWire', posts: '8.7K Tweets' },
                  { topic: '#ChampionshipWeek', posts: '15.2K Tweets' },
                  { topic: '#StartSitAdvice', posts: '5.1K Tweets' }
                ].map((trend, index) => (
                  <div key={index} className="cursor-pointer hover:bg-gray-800 rounded p-2 -m-2 transition-colors">
                    <p className="font-semibold">{trend.topic}</p>
                    <p className="text-gray-500 text-sm">{trend.posts}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent Activity */}
            <div className="bg-gray-900 rounded-2xl p-4">
              <h2 className="text-xl font-bold mb-3">AI Agent Activity</h2>
              <div className="space-y-3">
                {enabledAgents.slice(0, 3).map((agent) => (
                  <div key={agent.id} className="flex items-center space-x-3">
                    <span className="text-2xl">{agent.avatar}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{agent.name}</p>
                      <p className="text-gray-500 text-xs">
                        {posts.filter(p => p.agentId === agent.id).length} tweets
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}