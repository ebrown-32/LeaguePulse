import { promises as fs } from 'fs';
import path from 'path';
import { type AgentPost, type AIAgent } from '@/config/aiAgents';

// Vercel KV for production
let kv: any = null;
try {
  if (process.env.VERCEL || process.env.KV_REST_API_URL) {
    kv = require('@vercel/kv').kv;
  }
} catch (error) {
  // KV not available, will use file storage
}

const DATA_DIR = path.join(process.cwd(), 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// File-based storage implementation
class FileStorage {
  private posts: AgentPost[] = [];
  private postsLoaded = false;
  private maxPosts = 500; // Keep last 500 posts
  
  private async loadPosts(): Promise<void> {
    if (this.postsLoaded) return;
    
    await ensureDataDir();
    try {
      const data = await fs.readFile(POSTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert timestamp strings back to Date objects
      this.posts = parsed.map((post: any) => ({
        ...post,
        timestamp: new Date(post.timestamp)
      }));
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      this.posts = [];
    }
    this.postsLoaded = true;
  }

  private async savePosts(): Promise<void> {
    await ensureDataDir();
    
    // Clean up old posts before saving
    this.cleanup();
    
    try {
      await fs.writeFile(POSTS_FILE, JSON.stringify(this.posts, null, 2));
    } catch (error) {
      console.error('Failed to save posts:', error);
    }
  }

  private cleanup() {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    
    // Remove posts older than 30 days
    this.posts = this.posts.filter(post => post.timestamp > thirtyDaysAgo);
    
    // Keep only the most recent posts if we exceed maxPosts
    if (this.posts.length > this.maxPosts) {
      this.posts = this.posts
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.maxPosts);
    }
  }

  async addPost(post: AgentPost): Promise<void> {
    await this.loadPosts();
    this.posts.unshift(post); // Add to beginning
    await this.savePosts();
  }

  async getPosts(limit = 50, offset = 0): Promise<AgentPost[]> {
    await this.loadPosts();
    return this.posts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  async getPostsByAgent(agentId: string, limit = 20): Promise<AgentPost[]> {
    await this.loadPosts();
    return this.posts
      .filter(post => post.agentId === agentId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async updatePost(postId: string, updates: Partial<AgentPost>): Promise<void> {
    await this.loadPosts();
    const index = this.posts.findIndex(post => post.id === postId);
    if (index !== -1) {
      this.posts[index] = { ...this.posts[index], ...updates };
      await this.savePosts();
    }
  }

  async deletePost(postId: string): Promise<void> {
    await this.loadPosts();
    this.posts = this.posts.filter(post => post.id !== postId);
    await this.savePosts();
  }

  async getPostCount(): Promise<number> {
    await this.loadPosts();
    return this.posts.length;
  }

  async getTrendingPosts(limit = 10): Promise<AgentPost[]> {
    await this.loadPosts();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return this.posts
      .filter(post => post.timestamp > yesterday)
      .sort((a, b) => {
        // Sort by engagement score (likes + retweets + replies)
        const scoreA = a.likes + a.retweets + a.replies;
        const scoreB = b.likes + b.retweets + b.replies;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  async clearOldPosts(): Promise<void> {
    await this.loadPosts();
    this.cleanup();
    await this.savePosts();
  }
}

// Agent configuration storage
class AgentConfigStorage {
  private configLoaded = false;
  private agents: AIAgent[] = [];

  private async loadAgents(): Promise<void> {
    if (this.configLoaded) return;
    
    await ensureDataDir();
    try {
      const data = await fs.readFile(AGENTS_FILE, 'utf-8');
      this.agents = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, agents will be loaded from default config when needed
      this.agents = [];
    }
    this.configLoaded = true;
  }


  async getAgents(): Promise<AIAgent[]> {
    await this.loadAgents();
    return [...this.agents]; // Return copy
  }

  async saveAgents(agents: AIAgent[]): Promise<void> {
    await this.loadAgents(); // Ensure we're initialized
    this.agents = [...agents]; // Store copy
    await this.saveAgentsToFile();
  }

  private async saveAgentsToFile(): Promise<void> {
    await ensureDataDir();
    try {
      await fs.writeFile(AGENTS_FILE, JSON.stringify(this.agents, null, 2));
    } catch (error) {
      console.error('Failed to save agent configurations:', error);
    }
  }

  async updateAgent(agent: AIAgent): Promise<void> {
    await this.loadAgents();
    const index = this.agents.findIndex(a => a.id === agent.id);
    if (index !== -1) {
      this.agents[index] = { ...agent };
    } else {
      this.agents.push({ ...agent });
    }
    await this.saveAgentsToFile();
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.loadAgents();
    this.agents = this.agents.filter(agent => agent.id !== agentId);
    await this.saveAgentsToFile();
  }

  async hasPersistedAgents(): Promise<boolean> {
    await ensureDataDir();
    try {
      await fs.access(AGENTS_FILE);
      const data = await fs.readFile(AGENTS_FILE, 'utf-8');
      const agents = JSON.parse(data);
      return Array.isArray(agents) && agents.length > 0;
    } catch {
      return false;
    }
  }
}

// Redis storage implementation (optional, for production scaling)
class RedisStorage {
  private redis: any;

  constructor() {
    // Only initialize Redis if available
    if (process.env.REDIS_URL) {
      try {
        // You'd install @upstash/redis for Vercel
        // this.redis = new Redis(process.env.REDIS_URL);
      } catch (error) {
        console.warn('Redis not available, falling back to file storage');
      }
    }
  }

  async addPost(post: AgentPost): Promise<void> {
    if (!this.redis) return;
    
    const key = `posts:${post.id}`;
    await this.redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(post)); // 30 day TTL
    
    // Add to sorted set for timeline
    await this.redis.zadd('timeline', post.timestamp.getTime(), post.id);
    
    // Add to agent-specific timeline
    await this.redis.zadd(`agent:${post.agentId}`, post.timestamp.getTime(), post.id);
  }

  async getPosts(limit = 50, offset = 0): Promise<AgentPost[]> {
    if (!this.redis) return [];
    
    const postIds = await this.redis.zrevrange('timeline', offset, offset + limit - 1);
    const posts = [];
    
    for (const id of postIds) {
      const postData = await this.redis.get(`posts:${id}`);
      if (postData) {
        const post = JSON.parse(postData);
        post.timestamp = new Date(post.timestamp);
        posts.push(post);
      }
    }
    
    return posts;
  }

  async getPostsByAgent(agentId: string, limit = 20): Promise<AgentPost[]> {
    if (!this.redis) return [];
    
    const postIds = await this.redis.zrevrange(`agent:${agentId}`, 0, limit - 1);
    const posts = [];
    
    for (const id of postIds) {
      const postData = await this.redis.get(`posts:${id}`);
      if (postData) {
        const post = JSON.parse(postData);
        post.timestamp = new Date(post.timestamp);
        posts.push(post);
      }
    }
    
    return posts;
  }

  async updatePost(postId: string, updates: Partial<AgentPost>): Promise<void> {
    if (!this.redis) return;
    
    const existingData = await this.redis.get(`posts:${postId}`);
    if (existingData) {
      const post = JSON.parse(existingData);
      const updatedPost = { ...post, ...updates };
      await this.redis.setex(`posts:${postId}`, 30 * 24 * 60 * 60, JSON.stringify(updatedPost));
    }
  }

  async deletePost(postId: string): Promise<void> {
    if (!this.redis) return;
    
    await this.redis.del(`posts:${postId}`);
    await this.redis.zrem('timeline', postId);
    // Remove from all agent timelines (would need to track which agent)
  }

  async getPostCount(): Promise<number> {
    if (!this.redis) return 0;
    
    return await this.redis.zcard('timeline');
  }

  async getTrendingPosts(limit = 10): Promise<AgentPost[]> {
    if (!this.redis) return [];
    
    // For now, just return recent posts with high engagement
    return this.getPosts(limit, 0);
  }

  async clearOldPosts(): Promise<void> {
    // Implement Redis cleanup if needed
  }
}

// Storage manager that chooses between file and Redis storage
class StorageManager {
  private postStorage: FileStorage | RedisStorage;
  private agentStorage: AgentConfigStorage;

  constructor() {
    // Use Redis if available, otherwise use file storage
    if (process.env.REDIS_URL) {
      this.postStorage = new RedisStorage();
    } else {
      this.postStorage = new FileStorage();
    }
    
    this.agentStorage = new AgentConfigStorage();
  }

  // Post methods
  async addPost(post: AgentPost): Promise<void> {
    return this.postStorage.addPost(post);
  }

  async getPosts(limit = 50, offset = 0): Promise<AgentPost[]> {
    return this.postStorage.getPosts(limit, offset);
  }

  async getPostsByAgent(agentId: string, limit = 20): Promise<AgentPost[]> {
    return this.postStorage.getPostsByAgent(agentId, limit);
  }

  async updatePost(postId: string, updates: Partial<AgentPost>): Promise<void> {
    return this.postStorage.updatePost(postId, updates);
  }

  async deletePost(postId: string): Promise<void> {
    return this.postStorage.deletePost(postId);
  }

  async getPostCount(): Promise<number> {
    return this.postStorage.getPostCount();
  }

  async getTrendingPosts(limit = 10): Promise<AgentPost[]> {
    return this.postStorage.getTrendingPosts(limit);
  }

  async clearOldPosts(): Promise<void> {
    return this.postStorage.clearOldPosts();
  }

  // Agent configuration methods
  async getAgents(): Promise<AIAgent[]> {
    return this.agentStorage.getAgents();
  }

  async saveAgents(agents: AIAgent[]): Promise<void> {
    return this.agentStorage.saveAgents(agents);
  }

  async updateAgent(agent: AIAgent): Promise<void> {
    return this.agentStorage.updateAgent(agent);
  }

  async deleteAgent(agentId: string): Promise<void> {
    return this.agentStorage.deleteAgent(agentId);
  }

  async hasPersistedAgents(): Promise<boolean> {
    return this.agentStorage.hasPersistedAgents();
  }
}

// Export singleton instance
export const storage = new StorageManager();

// League data cache (in-memory for performance)
interface LeagueData {
  league: any;
  rosters: any[];
  users: any[];
  matchups: any[];
  lastUpdated: Date;
}

class LeagueCache {
  private cache: Map<string, LeagueData> = new Map();
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes

  async getLeagueData(leagueId: string): Promise<LeagueData | null> {
    const cached = this.cache.get(leagueId);
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  async setLeagueData(leagueId: string, data: Omit<LeagueData, 'lastUpdated'>): Promise<void> {
    this.cache.set(leagueId, {
      ...data,
      lastUpdated: new Date()
    });
  }

  async clearCache(leagueId?: string): Promise<void> {
    if (leagueId) {
      this.cache.delete(leagueId);
    } else {
      this.cache.clear();
    }
  }
}

export const leagueCache = new LeagueCache();