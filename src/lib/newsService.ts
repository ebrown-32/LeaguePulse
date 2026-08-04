import { getArticles } from './mediaSources';

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

  static getInstance(): NewsService {
    if (!NewsService.instance) {
      NewsService.instance = new NewsService();
    }
    return NewsService.instance;
  }

  /** Real NFL news pulled from ESPN + publisher RSS feeds via mediaSources, not fabricated placeholders. */
  async getLatestNews(limit = 10): Promise<NewsItem[]> {
    const articles = await getArticles(limit);
    return articles.slice(0, limit).map(a => ({
      id: a.id,
      title: a.headline,
      description: a.description,
      url: a.url,
      published: new Date(a.published),
      source: a.source,
      category: 'NFL News',
      impact: a.impact,
    }));
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
