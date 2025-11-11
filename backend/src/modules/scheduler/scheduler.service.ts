import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CrawlerService } from '../crawler/crawler.service';
import { PublisherService } from '../publisher/publisher.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AIService } from '../ai/ai.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue('crawl') private crawlQueue: Queue,
    @InjectQueue('publish') private publishQueue: Queue,
    @InjectQueue('analyze') private analyzeQueue: Queue,
    private crawlerService: CrawlerService,
    private publisherService: PublisherService,
    private analyticsService: AnalyticsService,
    private aiService: AIService,
    private databaseService: DatabaseService,
  ) {}

  // 每天早上9点执行爬取任务
  @Cron('0 9 * * *', {
    name: 'daily-crawl',
    timeZone: 'Asia/Shanghai',
  })
  async dailyCrawl() {
    try {
      this.logger.log('Starting daily crawl task...');

      // 获取最新策略
      const strategy = await this.getLatestStrategy();

      // 获取所有站点配置
      const sites = await this.databaseService.findAllSites();

      if (sites.length === 0) {
        this.logger.warn('No sites configured for crawling');
        return;
      }

      // 为每个站点添加爬取任务
      for (const site of sites) {
        await this.crawlQueue.add('crawl', {
          siteConfig: {
            url: site.url,
            name: site.name,
            selectors: site.selectors,
          },
          strategy,
        });

        this.logger.log(`Crawl job added for site: ${site.name}`);
      }

      this.logger.log(`Daily crawl task completed: ${sites.length} sites queued`);
    } catch (error) {
      this.logger.error('Daily crawl task failed:', error);
    }
  }

  // 每天上午10点执行内容生成任务
  @Cron('0 10 * * *', {
    name: 'daily-generate',
    timeZone: 'Asia/Shanghai',
  })
  async dailyGenerate() {
    try {
      this.logger.log('Starting daily content generation task...');

      // 获取最新爬取的数据
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const today = new Date();

      const rawData = await this.databaseService.findRawContentByDateRange(
        yesterday,
        today,
      );

      if (rawData.length === 0) {
        this.logger.warn('No raw data available for content generation');
        return;
      }

      // 获取最新策略
      const strategy = await this.getLatestStrategy();

      // 生成内容
      const contents = await this.aiService.generateContent(rawData, strategy);

      // 保存生成的内容
      for (const content of contents) {
        await this.databaseService.createContent({
          title: content.title,
          content: content.content,
          tags: content.tags,
          status: 'pending',
        });
      }

      this.logger.log(`Content generation completed: ${contents.length} contents created`);
    } catch (error) {
      this.logger.error('Content generation task failed:', error);
    }
  }

  // 每天晚上8点执行发布任务
  @Cron('0 20 * * *', {
    name: 'daily-publish',
    timeZone: 'Asia/Shanghai',
  })
  async dailyPublish() {
    try {
      this.logger.log('Starting daily publish task...');

      // 获取待发布内容
      const contents = await this.publisherService.getPendingContent();

      if (contents.length === 0) {
        this.logger.warn('No content available for publishing');
        return;
      }

      // 发布前3篇内容
      const toPublish = contents.slice(0, 3);

      for (const content of toPublish) {
        await this.publishQueue.add('publish', {
          content: {
            id: (content as any)._id?.toString() || '', // MongoDB _id
            title: content.title,
            content: content.content,
            imagePath: content.imageUrl,
            tags: content.tags,
          },
        });

        this.logger.log(`Publish job added for content: ${content.title}`);
      }

      this.logger.log(`Daily publish task completed: ${toPublish.length} contents queued`);
    } catch (error) {
      this.logger.error('Daily publish task failed:', error);
    }
  }

  // 每天晚上11点执行数据分析和策略生成任务
  @Cron('0 23 * * *', {
    name: 'daily-analyze',
    timeZone: 'Asia/Shanghai',
  })
  async dailyAnalyze() {
    try {
      this.logger.log('Starting daily analysis and strategy generation task...');

      // 分析最近7天的数据
      const analytics = await this.analyticsService.analyzePerformance(7);

      this.logger.log(`Performance metrics: ${JSON.stringify(analytics)}`);

      // 基于分析结果生成新策略
      const newStrategy = await this.aiService.generateStrategy(analytics);

      this.logger.log(`New strategy generated: ${JSON.stringify(newStrategy)}`);

      this.logger.log('Daily analysis task completed');
    } catch (error) {
      this.logger.error('Daily analysis task failed:', error);
    }
  }

  // 每小时检查一次队列健康状态
  @Cron(CronExpression.EVERY_HOUR)
  async checkQueueHealth() {
    try {
      const crawlJobCounts = await this.crawlQueue.getJobCounts();
      const publishJobCounts = await this.publishQueue.getJobCounts();
      const analyzeJobCounts = await this.analyzeQueue.getJobCounts();

      this.logger.log(`Queue Health Check:
        Crawl Queue: ${JSON.stringify(crawlJobCounts)}
        Publish Queue: ${JSON.stringify(publishJobCounts)}
        Analyze Queue: ${JSON.stringify(analyzeJobCounts)}
      `);

      // 如果有太多失败的任务，发送告警
      if (crawlJobCounts.failed > 10 || publishJobCounts.failed > 10) {
        this.logger.warn('Too many failed jobs detected!');
        // 这里可以接入告警系统
      }
    } catch (error) {
      this.logger.error('Queue health check failed:', error);
    }
  }

  private async getLatestStrategy(): Promise<any> {
    const strategy = await this.databaseService.getLatestStrategy();

    if (!strategy) {
      // 返回默认策略
      return {
        keywords: ['热门', '推荐', '必看'],
        minLikes: 100,
        contentType: 'general',
        negativeKeywords: ['广告', '推广'],
        trendInsight: 'Default strategy',
      };
    }

    return {
      keywords: strategy.keywords,
      minLikes: strategy.minLikes,
      contentType: strategy.contentType,
      negativeKeywords: strategy.negativeKeywords,
      trendInsight: strategy.trendInsight,
    };
  }

  // 手动触发任务的方法
  async triggerCrawl(): Promise<void> {
    await this.dailyCrawl();
  }

  async triggerGenerate(): Promise<void> {
    await this.dailyGenerate();
  }

  async triggerPublish(): Promise<void> {
    await this.dailyPublish();
  }

  async triggerAnalyze(): Promise<void> {
    await this.dailyAnalyze();
  }
}
