import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SchedulerService } from './scheduler.service';
import { CrawlerModule } from '../crawler/crawler.module';
import { PublisherModule } from '../publisher/publisher.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'crawl' },
      { name: 'publish' },
      { name: 'analyze' },
    ),
    CrawlerModule,
    PublisherModule,
    AnalyticsModule,
    AIModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
