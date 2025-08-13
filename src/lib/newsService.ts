export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  published: Date;
  source: string;
  category: string;
  players?: string[];
  teams?: string[];
  impact: 'high' | 'medium' | 'low';
}

export class NewsService {
  private static instance: NewsService;
  private cache: Map<string, { data: NewsItem[]; timestamp: number }> = new Map();
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes

  static getInstance(): NewsService {
    if (!NewsService.instance) {
      NewsService.instance = new NewsService();
    }
    return NewsService.instance;
  }

  async getLatestNews(limit = 10): Promise<NewsItem[]> {
    const cacheKey = `news_${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const sources = [
      this.fetchESPNNews,
      this.fetchNFLNews,
      this.fetchSleeperNews,
      this.fetchFantasyProsNews
    ];

    const allNews: NewsItem[] = [];

    for (const source of sources) {
      try {
        const news = await source.call(this, limit);
        allNews.push(...news);
      } catch (error) {
        console.warn('News source failed:', error);
      }
    }

    // Remove duplicates and sort by recency
    const uniqueNews = this.deduplicateNews(allNews);
    const sortedNews = uniqueNews
      .sort((a, b) => b.published.getTime() - a.published.getTime())
      .slice(0, limit);

    this.cache.set(cacheKey, { data: sortedNews, timestamp: Date.now() });
    return sortedNews;
  }

  private async fetchESPNNews(limit: number): Promise<NewsItem[]> {
    try {
      // ESPN RSS feed - free and no API key required
      const response = await fetch('https://www.espn.com/espn/rss/nfl/news');
      if (!response.ok) throw new Error('ESPN RSS failed');

      const text = await response.text();
      return this.parseESPNRSS(text, limit);
    } catch (error) {
      console.warn('ESPN news fetch failed:', error);
      return [];
    }
  }

  private parseESPNRSS(rssText: string, limit: number): NewsItem[] {
    const items: NewsItem[] = [];
    
    // Basic RSS parsing - in production you'd use a proper XML parser
    const itemMatches = rssText.match(/<item>[\s\S]*?<\/item>/g) || [];
    
    for (let i = 0; i < Math.min(itemMatches.length, limit); i++) {
      const item = itemMatches[i];
      
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
      const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);

      if (titleMatch && descMatch) {
        items.push({
          id: `espn_${Date.now()}_${i}`,
          title: titleMatch[1],
          description: descMatch[1].replace(/<[^>]*>/g, '').slice(0, 200),
          url: linkMatch?.[1] || '',
          published: pubDateMatch ? new Date(pubDateMatch[1]) : new Date(),
          source: 'ESPN',
          category: 'NFL News',
          impact: this.categorizeImpact(titleMatch[1])
        });
      }
    }

    return items;
  }

  private async fetchNFLNews(limit: number): Promise<NewsItem[]> {
    try {
      // NFL.com has limited API access, using news aggregation approach
      const response = await fetch('https://www.nfl.com/news/');
      if (!response.ok) throw new Error('NFL.com failed');

      // In production, you'd parse the HTML or use their API if available
      // For now, return structured placeholder
      return this.generateNFLNewsStructure(limit);
    } catch (error) {
      console.warn('NFL news fetch failed:', error);
      return [];
    }
  }

  private generateNFLNewsStructure(limit: number): NewsItem[] {
    // This would be replaced with actual NFL.com parsing
    const newsTypes = [
      { title: 'injury', impact: 'high' as const },
      { title: 'trade', impact: 'high' as const },
      { title: 'signing', impact: 'medium' as const },
      { title: 'performance', impact: 'medium' as const },
      { title: 'coaching', impact: 'low' as const }
    ];

    return newsTypes.slice(0, limit).map((type, index) => ({
      id: `nfl_${Date.now()}_${index}`,
      title: `NFL ${type.title} update from official sources`,
      description: `Latest ${type.title} news affecting fantasy football lineups and player values.`,
      url: 'https://www.nfl.com/news/',
      published: new Date(Date.now() - index * 60 * 60 * 1000),
      source: 'NFL.com',
      category: type.title,
      impact: type.impact
    }));
  }

  private async fetchSleeperNews(limit: number): Promise<NewsItem[]> {
    try {
      // Sleeper has trending players API
      const response = await fetch('https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=10');
      if (!response.ok) throw new Error('Sleeper trending failed');

      const trendingPlayerIds = await response.json();
      
      // Convert trending players to news items
      return trendingPlayerIds.slice(0, limit).map((playerId: string, index: number) => ({
        id: `sleeper_trending_${playerId}`,
        title: `Player trending: ${playerId} gaining attention`,
        description: `This player is being added to rosters at an increased rate over the last 24 hours.`,
        url: `https://sleeper.app/players/${playerId}`,
        published: new Date(Date.now() - index * 30 * 60 * 1000),
        source: 'Sleeper',
        category: 'Trending Players',
        players: [playerId],
        impact: 'medium' as const
      }));
    } catch (error) {
      console.warn('Sleeper news fetch failed:', error);
      return [];
    }
  }

  private async fetchFantasyProsNews(limit: number): Promise<NewsItem[]> {
    try {
      // FantasyPros API (if you have a key)
      const apiKey = process.env.FANTASY_PROS_API_KEY;
      if (!apiKey) return [];

      const response = await fetch(
        `https://api.fantasypros.com/v2/json/nfl/news?api_key=${apiKey}&limit=${limit}`
      );
      
      if (!response.ok) throw new Error('FantasyPros API failed');

      const data = await response.json();
      
      return data.news?.map((item: any, index: number) => ({
        id: `fantasypros_${item.id || index}`,
        title: item.title,
        description: item.description || item.summary,
        url: item.url,
        published: new Date(item.published || item.date),
        source: 'FantasyPros',
        category: item.category || 'Fantasy News',
        players: item.players || [],
        impact: this.categorizeImpact(item.title)
      })) || [];
    } catch (error) {
      console.warn('FantasyPros news fetch failed:', error);
      return [];
    }
  }

  private categorizeImpact(title: string): 'high' | 'medium' | 'low' {
    const highImpactKeywords = ['injury', 'out', 'suspended', 'trade', 'released', 'ir', 'questionable'];
    const mediumImpactKeywords = ['probable', 'limited', 'practice', 'targets', 'carries', 'snaps'];
    
    const titleLower = title.toLowerCase();
    
    if (highImpactKeywords.some(keyword => titleLower.includes(keyword))) {
      return 'high';
    }
    
    if (mediumImpactKeywords.some(keyword => titleLower.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }

  private deduplicateNews(news: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return news.filter(item => {
      const key = `${item.title.toLowerCase().slice(0, 50)}_${item.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async getRecentNewsByCategory(category: string, limit = 5): Promise<NewsItem[]> {
    const allNews = await this.getLatestNews(50);
    return allNews
      .filter(item => item.category.toLowerCase().includes(category.toLowerCase()))
      .slice(0, limit);
  }

  async getHighImpactNews(limit = 5): Promise<NewsItem[]> {
    const allNews = await this.getLatestNews(50);
    return allNews
      .filter(item => item.impact === 'high')
      .slice(0, limit);
  }
}

export const newsService = NewsService.getInstance();