export enum PlatformType {
  ZHIHU = 'zhihu',
  WECHAT = 'wechat',
  NEWS = 'news',
}

export interface CrawlConfig {
  platform: PlatformType;
  baseUrl: string;
  selectors?: Record<string, string>;
  headers?: Record<string, string>;
  rateLimit?: number; // 请求间隔（毫秒）
  maxPages?: number; // 最大爬取页数
  keywords?: string[]; // 关键词过滤
}

export interface RawArticle {
  title: string;
  content: string;
  author: string;
  authorUrl?: string;
  url: string;
  publishTime: Date;
  tags: string[];
  likes?: number;
  comments?: number;
  views?: number;
  platform: PlatformType;
  crawledAt: Date;
}

export interface CrawlResult {
  success: boolean;
  articles: RawArticle[];
  errors?: string[];
  totalCrawled: number;
  platform: PlatformType;
}

export abstract class BaseCrawler {
  protected config: CrawlConfig;
  protected rateLimit: number;

  constructor(config: CrawlConfig) {
    this.config = config;
    this.rateLimit = config.rateLimit || 1000; // 默认1秒间隔
  }

  abstract crawl(keyword?: string): Promise<CrawlResult>;

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected isValidArticle(article: any): article is RawArticle {
    return article &&
           typeof article.title === 'string' &&
           typeof article.content === 'string' &&
           typeof article.author === 'string' &&
           typeof article.url === 'string';
  }

  protected cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  protected extractTags(text: string): string[] {
    // 简单的标签提取，可以根据需要优化
    const tagPattern = /#([^#\s]+)#/g;
    const tags = [];
    let match;
    while ((match = tagPattern.exec(text)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }
}