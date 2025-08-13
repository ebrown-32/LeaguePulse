import { promises as fs } from 'fs';
import path from 'path';
import { type AgentPost, type AIAgent } from '@/config/aiAgents';

// Redis for production (from Vercel marketplace)
let redis: any = null;
try {
  // Only initialize Redis if we have a real URL (not placeholder)
  const redisUrl = process.env.REDIS_URL;
  if ((process.env.VERCEL || redisUrl) && redisUrl && !redisUrl.includes('your-redis')) {
    const { createClient } = require('redis');
    redis = createClient({
      url: redisUrl
    });
    
    // Handle Redis errors gracefully
    redis.on('error', (err: any) => {
      console.log('Redis Client Error', err);
      // Don't crash, just fall back to file storage
      redis = null;
    });
  }
} catch (error) {
  // Redis not available, will use file storage
  console.log('Redis not available, using file storage:', error instanceof Error ? error.message : 'Unknown error');
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

// Hybrid storage for posts (KV + File)
class HybridPostStorage {
  private posts: AgentPost[] = [];
  private postsLoaded = false;
  private maxPosts = 500;
  private useRedis = !!redis;

  private async loadPosts(): Promise<void> {
    if (this.postsLoaded) return;
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        const data = await redis.get('posts');
        const parsed = data ? JSON.parse(data) : [];
        this.posts = parsed.map((post: any) => ({
          ...post,
          timestamp: new Date(post.timestamp)
        }));
      } catch (error) {
        console.error('Failed to load posts from Redis:', error);
        this.posts = [];
      }
    } else {
      // File storage for local development
      await ensureDataDir();
      try {
        const data = await fs.readFile(POSTS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        this.posts = parsed.map((post: any) => ({
          ...post,
          timestamp: new Date(post.timestamp)
        }));
      } catch (error) {
        this.posts = [];
      }
    }
    this.postsLoaded = true;
  }

  private async savePosts(): Promise<void> {
    this.cleanup();
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        await redis.set('posts', JSON.stringify(this.posts));
      } catch (error) {
        console.error('Failed to save posts to Redis:', error);
      }
    } else {
      // File storage for local development
      await ensureDataDir();
      try {
        await fs.writeFile(POSTS_FILE, JSON.stringify(this.posts, null, 2));
      } catch (error) {
        console.error('Failed to save posts:', error);
      }
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
    this.posts.unshift(post);
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

// Hybrid Agent configuration storage (KV + File)
class HybridAgentStorage {
  private configLoaded = false;
  private agents: AIAgent[] = [];
  private useRedis = !!redis;

  private async loadAgents(): Promise<void> {
    if (this.configLoaded) return;
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        const data = await redis.get('agents');
        this.agents = data ? JSON.parse(data) : [];
      } catch (error) {
        console.error('Failed to load agents from Redis:', error);
        this.agents = [];
      }
    } else {
      // File storage for local development
      await ensureDataDir();
      try {
        const data = await fs.readFile(AGENTS_FILE, 'utf-8');
        this.agents = JSON.parse(data);
      } catch (error) {
        this.agents = [];
      }
    }
    this.configLoaded = true;
  }

  async getAgents(): Promise<AIAgent[]> {
    await this.loadAgents();
    return [...this.agents];
  }

  async saveAgents(agents: AIAgent[]): Promise<void> {
    await this.loadAgents();
    this.agents = [...agents];
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        await redis.set('agents', JSON.stringify(this.agents));
      } catch (error) {
        console.error('Failed to save agents to Redis:', error);
      }
    } else {
      await this.saveAgentsToFile();
    }
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
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        await redis.set('agents', JSON.stringify(this.agents));
      } catch (error) {
        console.error('Failed to update agent in Redis:', error);
      }
    } else {
      await this.saveAgentsToFile();
    }
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.loadAgents();
    this.agents = this.agents.filter(agent => agent.id !== agentId);
    
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        await redis.set('agents', JSON.stringify(this.agents));
      } catch (error) {
        console.error('Failed to delete agent from Redis:', error);
      }
    } else {
      await this.saveAgentsToFile();
    }
  }

  async hasPersistedAgents(): Promise<boolean> {
    if (this.useRedis) {
      try {
        if (!redis.isOpen) await redis.connect();
        const data = await redis.get('agents');
        const agents = data ? JSON.parse(data) : [];
        return Array.isArray(agents) && agents.length > 0;
      } catch {
        return false;
      }
    } else {
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
}

// Hybrid Storage Manager
class HybridStorageManager {
  private postStorage: HybridPostStorage;
  private agentStorage: HybridAgentStorage;

  constructor() {
    this.postStorage = new HybridPostStorage();
    this.agentStorage = new HybridAgentStorage();
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
export const storage = new HybridStorageManager();

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