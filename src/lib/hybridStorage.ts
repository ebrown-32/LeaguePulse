/**
 * In-memory league data cache.
 *
 * This file used to also host Redis/file-backed storage for the legacy
 * ai-agents system (HybridPostStorage / HybridAgentStorage / the `storage`
 * singleton). That system was retired; AI content now persists through
 * lib/ai/store.ts. Only the cache survived, because sleeperApi.ts leans on it
 * to keep the media feed from re-fetching league data on every request.
 */

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
