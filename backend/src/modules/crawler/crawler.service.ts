import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { SmartCrawlerService } from './smart-crawler.service';
import * as crypto from 'crypto';

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
  logs?: any[]; // AI 思考过程日志
  taskId?: string; // 任务 ID
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
   * 生成爬虫任务 ID
   */
  private generateCrawlTaskId(): string {
    return `crawl-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * 异步爬取单平台（立即返回任务 ID，后台执行）
   * @param platform 平台
   * @param keyword 关键词
   * @param streaming 是否流式输出
   * @param includeLogs 是否记录日志
   * @returns 任务 ID
   */
  async crawlPlatformAsync(
    platform: PlatformType,
    keyword?: string,
    streaming: boolean = false,
    includeLogs: boolean = false,
  ): Promise<string> {
    const taskId = this.generateCrawlTaskId();

    this.logger.log(`🚀 异步爬取任务已提交 [${taskId}]: ${platform} ${keyword || ''}`);

    // 后台异步执行，不等待结果
    this.executeCrawlTask(taskId, platform, keyword, streaming, includeLogs).catch((error) => {
      this.logger.error(`❌ 异步爬取任务失败 [${taskId}]: ${error.message}`);
    });

    return taskId;
  }

  /**
   * 执行爬取任务（内部方法）
   */
  private async executeCrawlTask(
    taskId: string,
    platform: PlatformType,
    keyword?: string,
    streaming: boolean = false,
    includeLogs: boolean = false,
  ): Promise<void> {
    try {
      this.logger.log(`🔧 开始执行爬取任务 [${taskId}]: ${platform} ${keyword || ''}`);

      const result = await this.smartCrawler.crawl(platform, keyword, streaming, includeLogs);

      if (result.success && result.articles.length > 0) {
        await this.saveCrawledData(result);
        this.logger.log(`✅ 爬取任务完成 [${taskId}]: ${result.totalCrawled} 篇文章`);
      } else {
        this.logger.warn(`⚠️ 爬取任务完成但无结果 [${taskId}]: ${result.errors?.join(', ') || '未知原因'}`);
      }
    } catch (error) {
      this.logger.error(`❌ 爬取任务执行失败 [${taskId}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * 异步爬取全平���（立即返回任务 ID 列表）
   */
  async crawlAllPlatformsAsync(keywords?: string[], streaming: boolean = false): Promise<string[]> {
    const platforms: PlatformType[] = ['zhihu', 'wechat', 'weibo'];
    const taskIds: string[] = [];

    for (const platform of platforms) {
      const keyword = keywords?.[Math.floor(Math.random() * keywords.length)];
      const taskId = await this.crawlPlatformAsync(platform, keyword, streaming, true);
      taskIds.push(taskId);
      // 稍微错开启动时间，避免同时请求
      await this.delay(1000);
    }

    return taskIds;
  }

  /**
   * 同步爬取单平台（等待完成）
   * @param platform 平台
   * @param keyword 关键词
   * @param streaming 是否流式输出（前端实时日志）
   * @param includeLogs 是否返回 AI 思考日志
   */
  async crawlPlatform(platform: PlatformType, keyword?: string, streaming: boolean = false, includeLogs: boolean = false): Promise<CrawlResult> {
    try {
      this.logger.log(`🚀 同步爬取 ${platform} ${keyword || ''}`);

      const result = await this.smartCrawler.crawl(platform, keyword, streaming, includeLogs);

      if (result.success && result.articles.length > 0) {
        await this.saveCrawledData(result);
      }

      return {
        success: result.success,
        platform,
        articles: result.articles,
        errors: result.errors,
        totalCrawled: result.totalCrawled,
        logs: result.logs,
        taskId: result.taskId,
      };
    } catch (error) {
      this.logger.error(`❌ 同步爬取失败: ${error.message}`);
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
   * 同步爬取全平台（等待完成）
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
