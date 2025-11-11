import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CrawlerService } from './crawler.service';

@Processor('crawl')
export class CrawlerProcessor {
  private readonly logger = new Logger(CrawlerProcessor.name);

  constructor(private crawlerService: CrawlerService) {}

  @Process('crawl')
  async handleCrawl(job: Job) {
    this.logger.log(`Processing crawl job ${job.id}`);
    const { siteConfig } = job.data;

    try {
      // 使用正确的方法调用爬虫服务
      const result = await this.crawlerService.crawlAllPlatforms();
      const totalArticles = result.reduce((sum, r) => sum + r.totalCrawled, 0);
      this.logger.log(`Crawl completed: ${totalArticles} items`);
      return { success: true, count: totalArticles };
    } catch (error) {
      this.logger.error(`Crawl job ${job.id} failed:`, error);
      throw error;
    }
  }
}
