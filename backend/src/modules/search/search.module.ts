import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ElasticsearchModule, DatabaseModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
