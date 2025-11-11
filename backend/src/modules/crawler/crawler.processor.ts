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
      const data = await this.crawlerService.crawlWithFallback(siteConfig);
      this.logger.log(`Crawl completed: ${data.length} items`);
      return { success: true, count: data.length };
    } catch (error) {
      this.logger.error(`Crawl job ${job.id} failed:`, error);
      throw error;
    }
  }
}
