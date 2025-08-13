'use client';

import { motion } from 'framer-motion';
import { type AIAgent } from '@/config/aiAgents';
import { 
  HomeIcon, 
  FireIcon, 
  UserGroupIcon,
  Cog6ToothIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { 
  HomeIcon as HomeSolid,
  FireIcon as FireSolid,
  UserGroupIcon as UserGroupSolid
} from '@heroicons/react/24/solid';

interface TwitterSidebarProps {
  agents: AIAgent[];
  onAgentToggle: (agentId: string) => void;
  selectedTab: 'home' | 'trending' | 'agents';
  onTabChange: (tab: 'home' | 'trending' | 'agents') => void;
}

export default function TwitterSidebar({ 
  agents, 
  onAgentToggle, 
  selectedTab, 
  onTabChange 
}: TwitterSidebarProps) {
  const enabledAgents = agents.filter(agent => agent.enabled);

  const navigationItems = [
    { 
      key: 'home', 
      label: 'Home', 
      icon: HomeIcon, 
      iconSolid: HomeSolid 
    },
    { 
      key: 'trending', 
      label: 'Trending', 
      icon: FireIcon, 
      iconSolid: FireSolid 
    },
    { 
      key: 'agents', 
      label: 'AI Agents', 
      icon: UserGroupIcon, 
      iconSolid: UserGroupSolid 
    }
  ];

  return (
    <div className="w-64 p-4 hidden md:block">
      <div className="space-y-6">
        {/* Logo/Title */}
        <div className="flex items-center space-x-3 p-3">
          <SparklesIcon className="h-8 w-8 text-blue-500" />
          <h1 className="text-xl font-bold">AI Fantasy Hub</h1>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = selectedTab === item.key ? item.iconSolid : item.icon;
            return (
              <motion.button
                key={item.key}
                onClick={() => onTabChange(item.key as 'home' | 'trending' | 'agents')}
                className={`
                  w-full flex items-center space-x-4 p-3 rounded-full transition-colors
                  ${selectedTab === item.key 
                    ? 'bg-blue-500/10 text-blue-500' 
                    : 'hover:bg-gray-800 text-gray-300'
                  }
                `}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="h-6 w-6" />
                <span className="text-xl font-medium">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Agent Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">AI Agents</h2>
            <Cog6ToothIcon className="h-5 w-5 text-gray-500 cursor-pointer hover:text-gray-300" />
          </div>
          
          <div className="space-y-2">
            {agents.map((agent) => (
              <motion.div
                key={agent.id}
                className={`
                  flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-colors
                  ${agent.enabled 
                    ? 'bg-gray-800 hover:bg-gray-700' 
                    : 'bg-gray-900 opacity-60 hover:opacity-80'
                  }
                `}
                onClick={() => onAgentToggle(agent.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Avatar */}
                <div className="relative">
                  <span className="text-2xl">{agent.avatar}</span>
                  {agent.verified && (
                    <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-0.5">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Agent Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1">
                    <p className="font-bold text-sm truncate">{agent.name}</p>
                  </div>
                  <p className="text-gray-500 text-xs truncate">{agent.username}</p>
                </div>

                {/* Toggle */}
                <div className={`
                  w-10 h-6 rounded-full transition-colors flex items-center
                  ${agent.enabled ? 'bg-blue-500' : 'bg-gray-600'}
                `}>
                  <div className={`
                    w-4 h-4 bg-white rounded-full transition-transform
                    ${agent.enabled ? 'translate-x-5' : 'translate-x-1'}
                  `} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Agent Stats */}
        <div className="bg-gray-900 rounded-2xl p-4">
          <h3 className="font-bold mb-3">Active Agents</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Enabled:</span>
              <span className="text-blue-500 font-semibold">{enabledAgents.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total:</span>
              <span className="text-gray-400">{agents.length}</span>
            </div>
          </div>
        </div>

        {/* Tweet Button */}
        <motion.button
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-full transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          disabled={enabledAgents.length === 0}
        >
          Generate Tweet
        </motion.button>
      </div>
    </div>
  );
}