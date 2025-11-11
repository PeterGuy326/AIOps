import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CrawlerService, SiteConfig } from './crawler.service';

@Controller('crawler')
export class CrawlerController {
  constructor(private crawlerService: CrawlerService) {}

  @Post('crawl')
  async crawl(@Body() siteConfig: SiteConfig) {
    const job = await this.crawlerService.addCrawlJob(siteConfig);
    return {
      message: 'Crawl job added to queue',
      jobId: job.id,
    };
  }

  @Post('crawl-now')
  async crawlNow(@Body() siteConfig: SiteConfig) {
    const data = await this.crawlerService.crawlWithFallback(siteConfig);
    return {
      message: 'Crawl completed',
      data,
      count: data.length,
    };
  }
}
