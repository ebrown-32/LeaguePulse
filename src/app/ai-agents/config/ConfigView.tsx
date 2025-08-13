'use client';

import { useState, useEffect } from 'react';
import { defaultAgents, availableTools, type AIAgent, type AgentTool } from '@/config/aiAgents';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  KeyIcon,
  GlobeAltIcon,
  ClockIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface SystemHealth {
  hasLLMKey: boolean;
  hasLeagueId: boolean;
  hasCronSecret: boolean;
  enabledAgents: number;
}

interface GenerationStats {
  totalPosts: number;
  lastGeneration: string | null;
  systemHealth: SystemHealth;
  storageError?: string;
}

export default function ConfigView() {
  const [agents, setAgents] = useState<AIAgent[]>(defaultAgents);
  const [loading, setLoading] = useState(false);
  const [testingGeneration, setTestingGeneration] = useState(false);
  const [generationStats, setGenerationStats] = useState<GenerationStats | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadGenerationStats();
  }, []);

  const loadGenerationStats = async () => {
    try {
      const response = await fetch('/api/ai-agents/auto-generate');
      if (response.ok) {
        const stats = await response.json();
        setGenerationStats(stats);
      }
    } catch (error) {
      console.error('Failed to load generation stats:', error);
    }
  };

  const handleAgentToggle = (agentId: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, enabled: !agent.enabled }
        : agent
    ));
  };

  const handleFrequencyChange = (agentId: string, frequency: 'low' | 'medium' | 'high') => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId 
        ? { ...agent, postFrequency: frequency }
        : agent
    ));
  };

  const handleSaveConfiguration = async () => {
    setLoading(true);
    try {
      // In a real app, this would save to a database or config service
      // For now, we'll just simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestGeneration = async () => {
    setTestingGeneration(true);
    try {
      const enabledAgentIds = agents.filter(a => a.enabled).map(a => a.id);
      const response = await fetch('/api/ai-agents/auto-generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'development-token'}`
        },
        body: JSON.stringify({ enabledAgentIds })
      });
      
      if (response.ok) {
        await loadGenerationStats();
        alert('Test generation completed! Check the feed for new posts.');
      } else {
        const error = await response.json();
        alert(`Test generation failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to test generation:', error);
      alert('Test generation failed. Check console for details.');
    } finally {
      setTestingGeneration(false);
    }
  };

  const enabledAgents = agents.filter(agent => agent.enabled);
  const systemHealth = generationStats?.systemHealth;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-blue-900 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* System Status */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <GlobeAltIcon className="h-6 w-6 text-blue-400" />
            <h2 className="text-2xl font-bold">System Status</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatusCard
              title="API Configuration"
              status={systemHealth?.hasLLMKey ? 'success' : 'error'}
              description={systemHealth?.hasLLMKey ? 'AI API keys configured' : 'Missing AI API keys'}
              icon={<KeyIcon className="h-5 w-5" />}
            />
            
            <StatusCard
              title="League Connection"
              status={systemHealth?.hasLeagueId ? 'success' : 'error'}
              description={systemHealth?.hasLeagueId ? 'League ID configured' : 'Missing league ID'}
              icon={<GlobeAltIcon className="h-5 w-5" />}
            />
            
            <StatusCard
              title="Automation"
              status={systemHealth?.hasCronSecret ? 'success' : 'warning'}
              description={systemHealth?.hasCronSecret ? 'Cron jobs configured' : 'Manual generation only'}
              icon={<ClockIcon className="h-5 w-5" />}
            />
            
            <StatusCard
              title="Active Agents"
              status={enabledAgents.length > 0 ? 'success' : 'warning'}
              description={`${enabledAgents.length} agents enabled`}
              icon={<SparklesIcon className="h-5 w-5" />}
            />
          </div>

          {generationStats && (
            <div className="mt-6 p-4 bg-gray-900/50 rounded-xl">
              <h3 className="text-lg font-semibold mb-2">Recent Activity</h3>
              <div className="text-sm text-gray-300 space-y-1">
                <p>Total posts (24h): <span className="text-blue-400">{generationStats.totalPosts}</span></p>
                <p>Last generation: <span className="text-blue-400">
                  {generationStats.lastGeneration 
                    ? new Date(generationStats.lastGeneration).toLocaleString()
                    : 'Never'
                  }
                </span></p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Setup Guide */}
        <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 backdrop-blur rounded-2xl p-6 border border-blue-700/50">
          <div className="flex items-center gap-3 mb-4">
            <InformationCircleIcon className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl font-bold">Quick Setup for Commissioners</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <SetupStep
              number="1"
              title="Add API Key"
              description="Add your Anthropic API key to .env.local: ANTHROPIC_API_KEY=your_key_here"
              completed={systemHealth?.hasLLMKey}
            />
            
            <SetupStep
              number="2"
              title="Enable Agents"
              description="Choose which AI personalities you want active in your league's social feed"
              completed={enabledAgents.length > 0}
            />
            
            <SetupStep
              number="3"
              title="Set Automation"
              description="Configure Vercel cron jobs for daily content generation (optional)"
              completed={systemHealth?.hasCronSecret}
            />
          </div>
        </div>

        {/* AI Agent Configuration */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <SparklesIcon className="h-6 w-6 text-purple-400" />
              <h2 className="text-2xl font-bold">AI Agent Configuration</h2>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleTestGeneration}
                disabled={testingGeneration || enabledAgents.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                {testingGeneration ? 'Testing...' : 'Test Generation'}
              </button>
              
              <button
                onClick={handleSaveConfiguration}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                {loading ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Config'}
              </button>
            </div>
          </div>

          <div className="grid gap-6">
            {agents.map((agent) => (
              <AgentConfigCard
                key={agent.id}
                agent={agent}
                onToggle={() => handleAgentToggle(agent.id)}
                onFrequencyChange={(frequency) => handleFrequencyChange(agent.id, frequency)}
              />
            ))}
          </div>
        </div>

        {/* Environment Variables Guide */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <KeyIcon className="h-6 w-6 text-yellow-400" />
            <h2 className="text-xl font-bold">Environment Variables Setup</h2>
          </div>
          
          <div className="space-y-4 text-sm">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-semibold text-green-400 mb-2">Required for AI Content:</h3>
              <code className="block bg-black/50 p-3 rounded text-green-300">
                ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
              </code>
              <p className="mt-2 text-gray-400">
                Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Anthropic Console</a>
              </p>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-400 mb-2">Already Configured:</h3>
              <code className="block bg-black/50 p-3 rounded text-blue-300">
                NEXT_PUBLIC_LEAGUE_ID={process.env.NEXT_PUBLIC_LEAGUE_ID}
                <br />CRON_SECRET=your_secret_here
              </code>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="font-semibold text-purple-400 mb-2">For Daily Automation (Vercel Cron):</h3>
              <code className="block bg-black/50 p-3 rounded text-purple-300">
                # Add to vercel.json:<br />
                {`{
  "crons": [{
    "path": "/api/ai-agents/auto-generate",
    "schedule": "0 9,15,21 * * *"
  }]
}`}
              </code>
              <p className="mt-2 text-gray-400">
                This will generate content at 9am, 3pm, and 9pm daily
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, status, description, icon }: {
  title: string;
  status: 'success' | 'warning' | 'error';
  description: string;
  icon: React.ReactNode;
}) {
  const statusColors = {
    success: 'border-green-500 bg-green-900/20',
    warning: 'border-yellow-500 bg-yellow-900/20',
    error: 'border-red-500 bg-red-900/20'
  };
  
  const statusIcons = {
    success: <CheckCircleIcon className="h-5 w-5 text-green-400" />,
    warning: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />,
    error: <XCircleIcon className="h-5 w-5 text-red-400" />
  };
  
  return (
    <div className={`p-4 rounded-xl border ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold">{title}</h3>
        </div>
        {statusIcons[status]}
      </div>
      <p className="text-sm text-gray-300">{description}</p>
    </div>
  );
}

function SetupStep({ number, title, description, completed }: {
  number: string;
  title: string;
  description: string;
  completed?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
        completed ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
      }`}>
        {completed ? '✓' : number}
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-gray-300">{description}</p>
      </div>
    </div>
  );
}

function AgentConfigCard({ agent, onToggle, onFrequencyChange }: {
  agent: AIAgent;
  onToggle: () => void;
  onFrequencyChange: (frequency: 'low' | 'medium' | 'high') => void;
}) {
  return (
    <div className={`p-6 rounded-xl border transition-all ${
      agent.enabled 
        ? 'border-blue-500 bg-blue-900/20' 
        : 'border-gray-600 bg-gray-900/20'
    }`}>
      <div className="flex items-start gap-4">
        <div className="text-3xl">{agent.avatar}</div>
        
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold">{agent.name}</h3>
            <span className="text-sm text-gray-400">{agent.username}</span>
            {agent.verified && (
              <CheckCircleIcon className="h-4 w-4 text-blue-400" />
            )}
          </div>
          
          <p className="text-sm text-gray-300 mb-4">{agent.bio}</p>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {agent.contentTypes.map((type) => (
              <span key={type} className="px-2 py-1 bg-gray-700 rounded text-xs">
                {type}
              </span>
            ))}
          </div>
          
          {agent.enabled && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-400">Posting frequency:</span>
              {(['low', 'medium', 'high'] as const).map((freq) => (
                <label key={freq} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={`frequency-${agent.id}`}
                    checked={agent.postFrequency === freq}
                    onChange={() => onFrequencyChange(freq)}
                    className="text-blue-600"
                  />
                  <span className="capitalize">{freq}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={agent.enabled}
              onChange={onToggle}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
}