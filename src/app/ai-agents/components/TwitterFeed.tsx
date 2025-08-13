'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { type AIAgent, type AgentPost, postTypes } from '@/config/aiAgents';
import { 
  HeartIcon, 
  ChatBubbleLeftIcon, 
  ArrowPathRoundedSquareIcon,
  ShareIcon,
  EllipsisHorizontalIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';

interface TwitterFeedProps {
  posts: AgentPost[];
  agents: AIAgent[];
  onLike: (postId: string) => void;
  onRetweet: (postId: string) => void;
  selectedTab: 'home' | 'trending' | 'agents';
  hasMore?: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
}

export default function TwitterFeed({ 
  posts, 
  agents, 
  onLike, 
  onRetweet, 
  selectedTab,
  hasMore = false,
  onLoadMore,
  loading = false
}: TwitterFeedProps) {
  const getAgent = (agentId: string) => agents.find(a => a.id === agentId);

  if (posts.length === 0) {
    return (
      <div className="p-8 text-center border-b border-gray-800">
        <div className="space-y-4">
          <div className="text-4xl">🤖</div>
          <h3 className="text-xl font-bold text-white">
            No tweets yet!
          </h3>
          <p className="text-gray-500">
            Enable some AI agents to see their takes on fantasy football.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AnimatePresence>
        {posts.map((post, index) => {
          const agent = getAgent(post.agentId);
          if (!agent) return null;

          const postType = postTypes[post.type];

          return (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className="border-b border-gray-800 hover:bg-gray-950/50 transition-colors cursor-pointer"
            >
              <div className="p-4">
                {/* Tweet Header */}
                <div className="flex space-x-3">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl">
                      {agent.avatar}
                    </div>
                    {agent.verified && (
                      <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* User Info */}
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-bold text-white hover:underline cursor-pointer">
                        {agent.name}
                      </h3>
                      {agent.verified && (
                        <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="text-gray-500">
                        {agent.username}
                      </span>
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-500">
                        {formatDistanceToNow(post.timestamp, { addSuffix: true })}
                      </span>
                      
                      {/* Post Type Badge */}
                      <div className={`
                        px-2 py-0.5 rounded-full text-xs font-medium
                        bg-${postType.color}-900/30 text-${postType.color}-400 border border-${postType.color}-800
                      `}>
                        {postType.emoji} {postType.label}
                      </div>
                    </div>

                    {/* Tweet Content */}
                    <div className="text-white whitespace-pre-wrap mb-3 leading-relaxed">
                      {post.content}
                    </div>

                    {/* Tweet Actions */}
                    <div className="flex items-center justify-between max-w-md">
                      {/* Reply */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex items-center space-x-1 text-gray-500 hover:text-blue-500 transition-colors group"
                      >
                        <div className="p-2 rounded-full group-hover:bg-blue-500/10">
                          <ChatBubbleLeftIcon className="h-5 w-5" />
                        </div>
                        <span className="text-sm">{post.replies}</span>
                      </motion.button>

                      {/* Retweet */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onRetweet(post.id)}
                        className="flex items-center space-x-1 text-gray-500 hover:text-green-500 transition-colors group"
                      >
                        <div className="p-2 rounded-full group-hover:bg-green-500/10">
                          <ArrowPathRoundedSquareIcon className="h-5 w-5" />
                        </div>
                        <span className="text-sm">{post.retweets}</span>
                      </motion.button>

                      {/* Like */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onLike(post.id)}
                        className="flex items-center space-x-1 text-gray-500 hover:text-red-500 transition-colors group"
                      >
                        <div className="p-2 rounded-full group-hover:bg-red-500/10">
                          <HeartIcon className="h-5 w-5" />
                        </div>
                        <span className="text-sm">{post.likes}</span>
                      </motion.button>

                      {/* Share */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex items-center space-x-1 text-gray-500 hover:text-blue-500 transition-colors group"
                      >
                        <div className="p-2 rounded-full group-hover:bg-blue-500/10">
                          <ShareIcon className="h-5 w-5" />
                        </div>
                      </motion.button>

                      {/* More */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="flex items-center space-x-1 text-gray-500 hover:text-blue-500 transition-colors group"
                      >
                        <div className="p-2 rounded-full group-hover:bg-blue-500/10">
                          <EllipsisHorizontalIcon className="h-5 w-5" />
                        </div>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Loading More */}
      {posts.length > 0 && hasMore && (
        <div className="p-8 text-center border-b border-gray-800">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onLoadMore}
            disabled={loading}
            className="text-blue-500 hover:underline disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more tweets'}
          </motion.button>
        </div>
      )}
    </div>
  );
}