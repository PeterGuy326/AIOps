import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import type { SearchHit, AggregationsTermsAggregateBase } from '@elastic/elasticsearch/lib/api/types';

interface TermsBucket {
  key: string;
  doc_count: number;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchService.name);
  private client: Client;
  private readonly indexName = 'raw_content';

  constructor(private configService: ConfigService) {
    this.client = new Client({
      node: this.configService.get<string>('ELASTICSEARCH_NODE'),
    });
  }

  async onModuleInit() {
    await this.createIndexIfNotExists();
  }

  private async createIndexIfNotExists() {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.indexName,
      });

      if (!indexExists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            settings: {
              analysis: {
                analyzer: {
                  chinese_analyzer: {
                    type: 'standard',
                    // 注意：如需中文分词，请安装 elasticsearch-analysis-ik 插件
                    // 然后将 type 改为 'ik_max_word'
                  },
                },
              },
            },
            mappings: {
              properties: {
                articleId: {
                  type: 'keyword', // MongoDB _id 关联
                },
                title: {
                  type: 'text',
                  analyzer: 'chinese_analyzer',
                  fields: {
                    keyword: { type: 'keyword' },
                  },
                },
                summary: {
                  type: 'text',
                  analyzer: 'chinese_analyzer',
                },
                fullContent: {
                  type: 'text',
                  analyzer: 'chinese_analyzer',
                  // 全文内容，支持完整分词搜索
                },
                author: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' },
                  },
                },
                platform: {
                  type: 'keyword',
                },
                tags: {
                  type: 'keyword',
                },
                likes: { type: 'integer' },
                comments: { type: 'integer' },
                views: { type: 'integer' },
                url: { type: 'keyword' },
                publishTime: { type: 'date' },
                crawledAt: { type: 'date' },
              },
            },
          },
        });
        this.logger.log(`✓ Created Elasticsearch index: ${this.indexName}`);
      } else {
        this.logger.log(`✓ Elasticsearch index already exists: ${this.indexName}`);
      }
    } catch (error) {
      this.logger.error('Error creating Elasticsearch index:', error.message || error);
      this.logger.warn('Elasticsearch indexing may not work properly. Check ES connection and configuration.');
    }
  }

  async indexDocument(id: string, document: any) {
    try {
      await this.client.index({
        index: this.indexName,
        id,
        document,
      });
      this.logger.debug(`Indexed document: ${id}`);
    } catch (error) {
      this.logger.error('Error indexing document:', error);
      throw error;
    }
  }

  async search(query: string, options: any = {}) {
    try {
      const {
        platform,
        tags,
        from = 0,
        size = 10,
        sortBy = 'publishTime',
        sortOrder = 'desc',
      } = options;

      const must: any[] = [];

      if (query) {
        must.push({
          multi_match: {
            query,
            fields: ['title^3', 'fullContent', 'summary^2', 'author^2'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        });
      }

      if (platform) {
        must.push({ term: { platform } });
      }

      if (tags && tags.length > 0) {
        must.push({ terms: { tags } });
      }

      const body: any = {
        query: must.length > 0 ? { bool: { must } } : { match_all: {} },
        from,
        size,
        sort: [{ [sortBy]: { order: sortOrder } }],
      };

      const result = await this.client.search({
        index: this.indexName,
        body,
      });

      return {
        total: result.hits.total,
        hits: result.hits.hits.map((hit: SearchHit<Record<string, any>>) => ({
          id: hit._id,
          score: hit._score,
          ...(hit._source as Record<string, any>),
        })),
      };
    } catch (error) {
      this.logger.error('Error searching:', error);
      throw error;
    }
  }

  async findSimilar(id: string, size: number = 5) {
    try {
      const result = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            more_like_this: {
              fields: ['title', 'fullContent', 'summary', 'tags'],
              like: [{ _index: this.indexName, _id: id }],
              min_term_freq: 1,
              max_query_terms: 12,
            },
          },
          size,
        },
      });

      return result.hits.hits.map((hit: SearchHit<Record<string, any>>) => ({
        id: hit._id,
        score: hit._score,
        ...(hit._source as Record<string, any>),
      }));
    } catch (error) {
      this.logger.error('Error finding similar documents:', error);
      throw error;
    }
  }

  async deleteDocument(id: string) {
    try {
      await this.client.delete({
        index: this.indexName,
        id,
      });
      this.logger.debug(`Deleted document: ${id}`);
    } catch (error) {
      this.logger.error('Error deleting document:', error);
      throw error;
    }
  }

  async updateDocument(id: string, document: any) {
    try {
      await this.client.update({
        index: this.indexName,
        id,
        doc: document,
      });
      this.logger.debug(`Updated document: ${id}`);
    } catch (error) {
      this.logger.error('Error updating document:', error);
      throw error;
    }
  }

  async aggregateTags(size: number = 20) {
    try {
      const result = await this.client.search({
        index: this.indexName,
        body: {
          size: 0,
          aggs: {
            popular_tags: {
              terms: {
                field: 'tags',
                size,
              },
            },
          },
        },
      });

      const agg = result.aggregations?.popular_tags as AggregationsTermsAggregateBase<TermsBucket> | undefined;
      return (agg?.buckets as TermsBucket[]) || [];
    } catch (error) {
      this.logger.error('Error aggregating tags:', error);
      throw error;
    }
  }

  /**
   * 通用搜索方法 - 支持复杂查询
   */
  async searchDocuments(searchParams: {
    query?: any;
    size?: number;
    from?: number;
    sort?: any;
    aggs?: any;
  }): Promise<any[]> {
    try {
      const { query, size = 10, from = 0, sort, aggs } = searchParams;

      const body: any = {
        query: query || { match_all: {} },
        size,
        from,
      };

      if (sort) {
        body.sort = sort;
      }

      if (aggs) {
        body.aggs = aggs;
      }

      const result = await this.client.search({
        index: this.indexName,
        body,
      });

      return result.hits.hits.map((hit: SearchHit<Record<string, any>>) => ({
        id: hit._id,
        score: hit._score,
        ...(hit._source as Record<string, any>),
      }));
    } catch (error) {
      this.logger.error('Error in searchDocuments:', error);
      throw error;
    }
  }
}
