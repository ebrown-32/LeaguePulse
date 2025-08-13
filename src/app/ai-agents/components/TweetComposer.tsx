'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { type AIAgent, type AgentPost, postTypes } from '@/config/aiAgents';
import { 
  PhotoIcon, 
  GifIcon, 
  FaceSmileIcon,
  MapPinIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface TweetComposerProps {
  agents: AIAgent[];
  onGenerateContent: (agentId: string, type: AgentPost['type']) => void;
}

export default function TweetComposer({ agents, onGenerateContent }: TweetComposerProps) {
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(
    agents.length > 0 ? agents[0] : null
  );
  const [selectedType, setSelectedType] = useState<AgentPost['type']>('general');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!selectedAgent) return;
    
    setIsGenerating(true);
    await onGenerateContent(selectedAgent.id, selectedType);
    setIsGenerating(false);
  };

  if (agents.length === 0) {
    return (
      <div className="border-b border-gray-800 p-4">
        <div className="text-center text-gray-500">
          Enable some AI agents to start tweeting!
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-800 p-4">
      <div className="flex space-x-3">
        {/* Agent Selector */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl">
            {selectedAgent?.avatar || '🤖'}
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {/* Agent and Type Selectors */}
          <div className="space-y-2">
            {/* Agent Selector */}
            <select
              value={selectedAgent?.id || ''}
              onChange={(e) => {
                const agent = agents.find(a => a.id === e.target.value);
                setSelectedAgent(agent || null);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an AI agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar} {agent.name} ({agent.username})
                </option>
              ))}
            </select>

            {/* Content Type Selector */}
            <div className="flex space-x-2 overflow-x-auto pb-2">
              {Object.entries(postTypes).map(([key, type]) => (
                <motion.button
                  key={key}
                  onClick={() => setSelectedType(key as AgentPost['type'])}
                  className={`
                    flex items-center space-x-1 px-3 py-1 rounded-full text-sm whitespace-nowrap transition-colors
                    ${selectedType === key
                      ? `bg-${type.color}-500/20 text-${type.color}-400 border border-${type.color}-500`
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }
                  `}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span>{type.emoji}</span>
                  <span>{type.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Agent Bio Preview */}
          {selectedAgent && (
            <div className="text-sm text-gray-400 bg-gray-900/50 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-white">{selectedAgent.name}</span>
                {selectedAgent.verified && (
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p>{selectedAgent.bio}</p>
              <div className="flex items-center space-x-4 mt-2 text-xs">
                <span>{selectedAgent.followers.toLocaleString()} followers</span>
                <span>{selectedAgent.following.toLocaleString()} following</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            {/* Tweet Actions */}
            <div className="flex items-center space-x-4">
              <button className="text-blue-500 hover:bg-blue-500/10 p-2 rounded-full transition-colors">
                <PhotoIcon className="h-5 w-5" />
              </button>
              <button className="text-blue-500 hover:bg-blue-500/10 p-2 rounded-full transition-colors">
                <GifIcon className="h-5 w-5" />
              </button>
              <button className="text-blue-500 hover:bg-blue-500/10 p-2 rounded-full transition-colors">
                <FaceSmileIcon className="h-5 w-5" />
              </button>
              <button className="text-blue-500 hover:bg-blue-500/10 p-2 rounded-full transition-colors">
                <MapPinIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Generate Button */}
            <motion.button
              onClick={handleGenerate}
              disabled={!selectedAgent || isGenerating}
              className={`
                flex items-center space-x-2 px-6 py-2 rounded-full font-bold transition-all
                ${!selectedAgent || isGenerating
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                }
              `}
              whileHover={!selectedAgent || isGenerating ? {} : { scale: 1.05 }}
              whileTap={!selectedAgent || isGenerating ? {} : { scale: 0.95 }}
            >
              {isGenerating ? (
                <>
                  <SparklesIcon className="h-4 w-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4" />
                  <span>Generate Tweet</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}