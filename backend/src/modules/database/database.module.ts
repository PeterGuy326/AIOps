import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseService } from './database.service';
import { Site, SiteSchema } from './schemas/site.schema';
import { RawContent, RawContentSchema } from './schemas/raw-content.schema';
import { Content, ContentSchema } from './schemas/content.schema';
import { Strategy, StrategySchema } from './schemas/strategy.schema';
import { CliHistory, CliHistorySchema } from './schemas/cli-history.schema';
import { UserInterest, UserInterestSchema } from './schemas/user-interest.schema';
import { CrawlTemplate, CrawlTemplateSchema } from './schemas/crawl-template.schema';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: RawContent.name, schema: RawContentSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Strategy.name, schema: StrategySchema },
      { name: CliHistory.name, schema: CliHistorySchema },
      { name: UserInterest.name, schema: UserInterestSchema },
      { name: CrawlTemplate.name, schema: CrawlTemplateSchema },
    ]),
    ElasticsearchModule,
  ],
  providers: [DatabaseService],
  exports: [DatabaseService, MongooseModule],
})
export class DatabaseModule {}
