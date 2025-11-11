import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { AIModule } from './modules/ai/ai.module';
import { PublisherModule } from './modules/publisher/publisher.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { DatabaseModule } from './modules/database/database.module';
import { ElasticsearchModule } from './modules/elasticsearch/elasticsearch.module';
import { SearchModule } from './modules/search/search.module';
import { CliModule } from './modules/cli/cli.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    MongooseModule.forRoot(
      `mongodb://${process.env.MONGO_USER}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}?authSource=admin`,
    ),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
      },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    ElasticsearchModule,
    SearchModule,
    CrawlerModule,
    AIModule,
    PublisherModule,
    AnalyticsModule,
    SchedulerModule,
    CliModule,
  ],
})
export class AppModule {}
