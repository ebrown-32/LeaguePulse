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
  SparklesIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  CogIcon,
  WrenchScrewdriverIcon
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

export default function AdminConfigView() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [agents, setAgents] = useState<AIAgent[]>(defaultAgents);
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingGeneration, setTestingGeneration] = useState(false);
  const [generationStats, setGenerationStats] = useState<GenerationStats | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (response.ok) {
        setIsAuthenticated(true);
        setPassword('');
        loadGenerationStats();
      } else {
        setAuthError('Invalid password');
      }
    } catch (error) {
      setAuthError('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

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

  const handleAgentSave = async (updatedAgent: AIAgent) => {
    setLoading(true);
    try {
      // In a real app, this would save to database
      setAgents(prev => prev.map(agent => 
        agent.id === updatedAgent.id ? updatedAgent : agent
      ));
      setSelectedAgent(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save agent:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = () => {
    const newAgent: AIAgent = {
      id: `custom-${Date.now()}`,
      name: 'New AI Agent',
      username: '@NewAgent',
      avatar: '🤖',
      bio: 'A custom AI personality for your league.',
      verified: false,
      followers: 100,
      following: 50,
      backgroundColor: 'from-gray-500/20 to-gray-600/20',
      accentColor: 'gray-500',
      enabled: false,
      systemPrompt: 'You are a friendly AI assistant that helps with fantasy football.',
      temperature: 0.7,
      maxTokens: 280,
      model: 'claude-3-haiku',
      contentTypes: ['general'],
      postFrequency: 'medium',
      tools: [
        { ...availableTools.find(t => t.id === 'league-analysis')!, enabled: true }
      ],
      personality: {
        tone: 'casual',
        expertise: ['fantasy football'],
        catchphrases: ['Let\s go!'],
        writingStyle: {
          useEmojis: true,
          useAllCaps: false,
          useHashtags: true,
          avgWordsPerPost: 40
        }
      }
    };
    setAgents(prev => [...prev, newAgent]);
    setSelectedAgent(newAgent);
  };

  const handleDeleteAgent = (agentId: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      setAgents(prev => prev.filter(agent => agent.id !== agentId));
      setSelectedAgent(null);
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
        alert('Test generation completed! Check the AI Agents feed for new posts.');
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-blue-900 flex items-center justify-center p-6">
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-8 border border-gray-700 max-w-md w-full">
          <div className="text-center mb-6">
            <LockClosedIcon className="h-12 w-12 text-blue-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
            <p className="text-gray-400">Enter admin password to configure AI agents</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-200"
              >
                {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
            
            {authError && (
              <div className="text-red-400 text-sm text-center">{authError}</div>
            )}
            
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Authenticating...' : 'Access Admin Panel'}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-gray-400">
            Set ADMIN_PASSWORD in your environment variables
          </div>
        </div>
      </div>
    );
  }

  const enabledAgents = agents.filter(agent => agent.enabled);
  const systemHealth = generationStats?.systemHealth;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-blue-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CogIcon className="h-8 w-8 text-blue-400" />
            <h1 className="text-3xl font-bold">AI Agent Administration</h1>
          </div>
          <button
            onClick={() => setIsAuthenticated(false)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>

        {/* System Status */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <GlobeAltIcon className="h-6 w-6 text-blue-400" />
            <h2 className="text-2xl font-bold">System Status</h2>
            <button
              onClick={handleTestGeneration}
              disabled={testingGeneration || enabledAgents.length === 0}
              className="ml-auto px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              {testingGeneration ? 'Testing...' : 'Test Generation'}
            </button>
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

        {/* Agent Management */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Agent List */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">AI Agents</h2>
                <button
                  onClick={handleCreateAgent}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Create New Agent"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedAgent?.id === agent.id
                        ? 'border-blue-500 bg-blue-900/20'
                        : agent.enabled
                        ? 'border-green-500/50 bg-green-900/10 hover:bg-green-900/20'
                        : 'border-gray-600 bg-gray-900/20 hover:bg-gray-900/40'
                    }`}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{agent.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{agent.name}</h3>
                          {agent.enabled && (
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{agent.username}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgent(agent);
                          }}
                          className="p-1 hover:bg-gray-700 rounded"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAgent(agent.id);
                          }}
                          className="p-1 hover:bg-red-700 rounded text-red-400"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agent Editor */}
          <div className="lg:col-span-2">
            {selectedAgent ? (
              <AgentEditor
                agent={selectedAgent}
                onSave={handleAgentSave}
                onCancel={() => setSelectedAgent(null)}
                loading={loading}
              />
            ) : (
              <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-12 border border-gray-700 text-center">
                <WrenchScrewdriverIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">Select an Agent to Configure</h3>
                <p className="text-gray-500">Choose an AI agent from the list to customize its personality, tools, and settings.</p>
              </div>
            )}
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

function ToolCard({ tool, isEnabled, onToggle }: {
  tool: AgentTool;
  isEnabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`p-3 rounded-lg border transition-all ${
      isEnabled 
        ? 'border-green-500/50 bg-green-900/10' 
        : 'border-gray-600 bg-gray-900/20'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h5 className="font-medium text-sm truncate">{tool.name}</h5>
          <p className="text-xs text-gray-400 mt-1">{tool.description}</p>
        </div>
        <button
          onClick={onToggle}
          className={`ml-2 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isEnabled
              ? 'bg-green-500 border-green-500'
              : 'border-gray-500 hover:border-gray-400'
          }`}
        >
          {isEnabled && <span className="text-white text-xs">✓</span>}
        </button>
      </div>
      
      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-xs text-gray-500">
            <strong>Parameters:</strong>
            <div className="mt-1 space-y-1">
              {Object.entries(tool.parameters).slice(0, 3).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400">{key}:</span>
                  <span className="text-gray-300">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</span>
                </div>
              ))}
              {Object.keys(tool.parameters).length > 3 && (
                <div className="text-gray-500">...and {Object.keys(tool.parameters).length - 3} more</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentEditor({ agent, onSave, onCancel, loading }: {
  agent: AIAgent;
  onSave: (agent: AIAgent) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [editedAgent, setEditedAgent] = useState<AIAgent>({ ...agent });

  const handleSave = () => {
    onSave(editedAgent);
  };

  const updateAgent = (updates: Partial<AIAgent>) => {
    setEditedAgent(prev => ({ ...prev, ...updates }));
  };

  const updatePersonality = (updates: Partial<AIAgent['personality']>) => {
    setEditedAgent(prev => ({
      ...prev,
      personality: { ...prev.personality, ...updates }
    }));
  };

  const updateWritingStyle = (updates: Partial<AIAgent['personality']['writingStyle']>) => {
    setEditedAgent(prev => ({
      ...prev,
      personality: {
        ...prev.personality,
        writingStyle: { ...prev.personality.writingStyle, ...updates }
      }
    }));
  };

  const toggleTool = (toolId: string) => {
    setEditedAgent(prev => {
      const existingTool = prev.tools.find(tool => tool.id === toolId);
      const availableTool = availableTools.find(tool => tool.id === toolId);
      
      if (existingTool) {
        // Toggle existing tool
        return {
          ...prev,
          tools: prev.tools.map(tool =>
            tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
          )
        };
      } else if (availableTool) {
        // Add new tool as enabled
        return {
          ...prev,
          tools: [...prev.tools, { ...availableTool, enabled: true }]
        };
      }
      
      return prev;
    });
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Configure Agent</h2>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={editedAgent.name}
              onChange={(e) => updateAgent({ name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={editedAgent.username}
              onChange={(e) => updateAgent({ username: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Avatar (Emoji)</label>
            <input
              type="text"
              value={editedAgent.avatar}
              onChange={(e) => updateAgent({ avatar: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editedAgent.enabled}
                onChange={(e) => updateAgent({ enabled: e.target.checked })}
                className="rounded"
              />
              <span>Enabled</span>
            </label>
          </div>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium mb-2">Bio</label>
          <textarea
            value={editedAgent.bio}
            onChange={(e) => updateAgent({ bio: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
          />
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-sm font-medium mb-2">System Prompt (Personality)</label>
          <textarea
            value={editedAgent.systemPrompt}
            onChange={(e) => updateAgent({ systemPrompt: e.target.value })}
            rows={8}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            placeholder="Define the agent's personality, tone, and behavior..."
          />
        </div>

        {/* LLM Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <select
              value={editedAgent.model || 'claude-3-haiku'}
              onChange={(e) => updateAgent({ model: e.target.value as AIAgent['model'] })}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            >
              <option value="claude-3-haiku">Claude 3 Haiku</option>
              <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="gpt-4">GPT-4</option>
              <option value="llama3-8b">Llama 3 8B</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Temperature ({editedAgent.temperature})</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={editedAgent.temperature}
              onChange={(e) => updateAgent({ temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Max Tokens</label>
            <input
              type="number"
              value={editedAgent.maxTokens}
              onChange={(e) => updateAgent({ maxTokens: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            />
          </div>
        </div>

        {/* Tools */}
        <div>
          <label className="block text-sm font-medium mb-3">Available Tools & Capabilities</label>
          <div className="space-y-4">
            
            {/* Core Sleeper API Tools */}
            <div>
              <h4 className="font-medium text-blue-400 mb-2">🏈 Sleeper API Tools</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {availableTools.filter(tool => 
                  ['get-league-standings', 'get-current-matchups', 'get-specific-matchup', 'get-close-games', 
                   'get-team-rosters', 'get-player-stats', 'get-waiver-trends', 'get-playoff-picture', 
                   'get-league-history', 'get-trade-activity'].includes(tool.id)
                ).map((tool) => {
                  const agentTool = editedAgent.tools.find(t => t.id === tool.id);
                  const isEnabled = agentTool?.enabled || false;
                  
                  return (
                    <ToolCard key={tool.id} tool={tool} isEnabled={isEnabled} onToggle={() => toggleTool(tool.id)} />
                  );
                })}
              </div>
            </div>

            {/* Analysis Tools */}
            <div>
              <h4 className="font-medium text-green-400 mb-2">📊 Analysis Tools</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {availableTools.filter(tool => 
                  ['power-rankings-generator', 'matchup-predictor', 'sleeper-news-monitor'].includes(tool.id)
                ).map((tool) => {
                  const agentTool = editedAgent.tools.find(t => t.id === tool.id);
                  const isEnabled = agentTool?.enabled || false;
                  
                  return (
                    <ToolCard key={tool.id} tool={tool} isEnabled={isEnabled} onToggle={() => toggleTool(tool.id)} />
                  );
                })}
              </div>
            </div>

            {/* Internet Search Tools */}
            <div>
              <h4 className="font-medium text-purple-400 mb-2">🌐 Internet Search Tools</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {availableTools.filter(tool => 
                  ['web-search', 'nfl-news-search', 'fantasy-analysis-search'].includes(tool.id)
                ).map((tool) => {
                  const agentTool = editedAgent.tools.find(t => t.id === tool.id);
                  const isEnabled = agentTool?.enabled || false;
                  
                  return (
                    <ToolCard key={tool.id} tool={tool} isEnabled={isEnabled} onToggle={() => toggleTool(tool.id)} />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Writing Style */}
        <div>
          <label className="block text-sm font-medium mb-3">Writing Style</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editedAgent.personality.writingStyle.useEmojis}
                onChange={(e) => updateWritingStyle({ useEmojis: e.target.checked })}
                className="rounded"
              />
              <span>Use Emojis</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editedAgent.personality.writingStyle.useAllCaps}
                onChange={(e) => updateWritingStyle({ useAllCaps: e.target.checked })}
                className="rounded"
              />
              <span>Use ALL CAPS</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editedAgent.personality.writingStyle.useHashtags}
                onChange={(e) => updateWritingStyle({ useHashtags: e.target.checked })}
                className="rounded"
              />
              <span>Use Hashtags</span>
            </label>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Avg Words/Post</label>
              <input
                type="number"
                value={editedAgent.personality.writingStyle.avgWordsPerPost}
                onChange={(e) => updateWritingStyle({ avgWordsPerPost: parseInt(e.target.value) })}
                className="w-full px-2 py-1 bg-gray-900/50 border border-gray-600 rounded text-white text-sm"
              />
            </div>
          </div>
        </div>

        {/* Catchphrases */}
        <div>
          <label className="block text-sm font-medium mb-2">Catchphrases (comma-separated)</label>
          <input
            type="text"
            value={editedAgent.personality.catchphrases.join(', ')}
            onChange={(e) => updatePersonality({ 
              catchphrases: e.target.value.split(',').map(phrase => phrase.trim()).filter(Boolean)
            })}
            className="w-full px-3 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white"
            placeholder="Let's go!, BOOM!, Numbers don't lie"
          />
        </div>
      </div>
    </div>
  );
}