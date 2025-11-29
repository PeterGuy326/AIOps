import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { SmartCrawlerService } from './smart-crawler.service';

export type PlatformType = 'zhihu' | 'wechat' | 'weibo';

export interface CrawlJobData {
  platform: PlatformType;
  keyword?: string;
}

export interface CrawlResult {
  success: boolean;
  platform: PlatformType;
  articles: any[];
  errors?: string[];
  totalCrawled: number;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    @InjectQueue('crawl') private crawlQueue: Queue,
    private databaseService: DatabaseService,
    private smartCrawler: SmartCrawlerService,
  ) {}

  async addCrawlJob(jobData: CrawlJobData) {
    return await this.crawlQueue.add('crawl', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  /**
   * 爬取单平台
   * @param platform 平台
   * @param keyword 关键词
   * @param streaming 是否流式输出（前端实时日志）
   */
  async crawlPlatform(platform: PlatformType, keyword?: string, streaming: boolean = false): Promise<CrawlResult> {
    try {
      this.logger.log(`🚀 爬取 ${platform} ${keyword || ''}`);

      const result = await this.smartCrawler.crawl(platform, keyword, streaming);

      if (result.success && result.articles.length > 0) {
        await this.saveCrawledData(result);
      }

      return {
        success: result.success,
        platform,
        articles: result.articles,
        errors: result.errors,
        totalCrawled: result.totalCrawled,
      };
    } catch (error) {
      this.logger.error(`❌ 爬取失败: ${error.message}`);
      return {
        success: false,
        platform,
        articles: [],
        errors: [error.message],
        totalCrawled: 0,
      };
    }
  }

  /**
   * 爬取全平台
   * @param keywords 关键词列表
   * @param streaming 是否流式输出
   */
  async crawlAllPlatforms(keywords?: string[], streaming: boolean = false): Promise<CrawlResult[]> {
    const platforms: PlatformType[] = ['zhihu', 'wechat', 'weibo'];
    const results: CrawlResult[] = [];

    for (const platform of platforms) {
      const keyword = keywords?.[Math.floor(Math.random() * keywords.length)];
      const result = await this.crawlPlatform(platform, keyword, streaming);
      results.push(result);
      await this.delay(3000);
    }

    return results;
  }

  private async saveCrawledData(result: any): Promise<void> {
    for (const article of result.articles) {
      try {
        const existing = await this.databaseService.findRawContentByUrl(article.url);
        if (existing) continue;

        // 保存到 MongoDB (元数据 + 摘要)
        const saved = await this.databaseService.saveRawContent({
          title: article.title,
          summary: article.summary,
          author: article.author,
          likes: article.likes || 0,
          comments: article.comments || 0,
          url: article.url,
          hasFullContent: !!article.fullContent,
          metadata: {
            platform: result.platform,
            publishTime: article.publishTime,
            crawledAt: article.crawledAt,
          },
        });

        // 同步到 Elasticsearch（只存储搜索相关字段）
        if (saved._id) {
          await this.databaseService.syncToElasticsearch(saved._id.toString(), {
            title: article.title,
            summary: article.summary,
            content: article.fullContent || article.summary, // 正文内容
            author: article.author,
            platform: result.platform,
            tags: article.tags || [],
            publishTime: article.publishTime,
            // 注意：不再同步 likes, comments, url, crawledAt 等元数据到 ES
          });
        }
      } catch (error) {
        this.logger.warn(`保存失败: ${article.title} - ${error.message}`);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getAvailablePlatforms(): PlatformType[] {
    return ['zhihu', 'wechat', 'weibo'];
  }

  async scheduleCrawlHotContent(): Promise<void> {
    const keywords = ['AI', '人工智能', '科技'];
    const results = await this.crawlAllPlatforms(keywords);
    this.logger.log(`定时爬取: ${results.filter((r) => r.success).length}/${results.length} 成功`);
  }
}
