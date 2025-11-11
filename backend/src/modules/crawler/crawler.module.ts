import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';
import { CrawlerProcessor } from './crawler.processor';
import { SmartCrawlerService } from './smart-crawler.service';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'crawl' }),
    DatabaseModule,
    AIModule,
  ],
  controllers: [CrawlerController],
  providers: [CrawlerService, CrawlerProcessor, SmartCrawlerService],
  exports: [CrawlerService, SmartCrawlerService],
})
export class CrawlerModule {}

