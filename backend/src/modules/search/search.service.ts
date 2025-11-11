import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly databaseService: DatabaseService,
  ) {}

  async search(query: string, options: any = {}) {
    return await this.elasticsearchService.search(query, options);
  }

  async findSimilar(id: string, size: number = 5) {
    return await this.elasticsearchService.findSimilar(id, size);
  }

  async getPopularTags(size: number = 20) {
    return await this.elasticsearchService.aggregateTags(size);
  }

  async getTrending(days: number = 7, size: number = 30) {
    return await this.databaseService.getTrendingContent(days, size);
  }
}
