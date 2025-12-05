import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly elasticsearchService: ElasticsearchService,
    private readonly databaseService: DatabaseService,
  ) {}

  /**
   * 获取所有原始内容（分页）- 直接从 MongoDB 查询
   */
  async getAllContents(options: {
    platform?: string;
    from?: number;
    size?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    const { platform, from = 0, size = 20, sortBy = 'crawledAt', sortOrder = 'desc' } = options;

    const result = await this.databaseService.findAllRawContents({
      platform,
      skip: from,
      limit: size,
      sortBy,
      sortOrder,
    });

    return {
      total: result.total,
      hits: result.contents.map((doc: any) => ({
        id: doc._id?.toString(),
        _id: doc._id?.toString(),
        title: doc.title,
        summary: doc.summary,
        content: doc.summary, // 兼容前端字段
        author: doc.author,
        platform: doc.platform || doc.metadata?.platform,
        url: doc.url,
        likes: doc.likes || 0,
        comments: doc.comments || 0,
        tags: doc.tags || [],
        status: 'crawled', // 爬取的内容状态
        publishTime: doc.publishTime || doc.metadata?.publishTime,
        crawledAt: doc.crawledAt,
        created_at: doc.crawledAt,
      })),
    };
  }

  /**
   * 搜索内容 - 两步查询
   * 1. 从 ES 获取 articleId 列表
   * 2. 根据 articleId 从 MongoDB 查询完整数据
   */
  async search(query: string, options: any = {}) {
    // 第一步：从 ES 搜索获取 articleId 列表
    const esResult = await this.elasticsearchService.search(query, options);

    // 如果没有结果，直接返回
    if (!esResult.articleIds || esResult.articleIds.length === 0) {
      return {
        total: esResult.total,
        hits: [],
      };
    }

    // 第二步：从 MongoDB 批量查询完整数据
    const articleIds = esResult.articleIds.map((item) => item.articleId);
    const documents = await this.databaseService.findRawContentsByIds(articleIds);

    // 按照 ES 返回的顺序和得分重新排序
    const scoreMap = new Map(
      esResult.articleIds.map((item) => [item.articleId, item.score]),
    );

    const hits = documents
      .map((doc) => ({
        id: doc._id.toString(),
        score: scoreMap.get(doc._id.toString()) || 0,
        ...doc.toObject(),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return {
      total: esResult.total,
      hits,
    };
  }

  /**
   * 查找相似内容 - 两步查询
   */
  async findSimilar(id: string, size: number = 5) {
    // 第一步：从 ES 获取相似文档的 articleId 列表
    const esResults = await this.elasticsearchService.findSimilar(id, size);

    // 如果没有结果，直接返回
    if (!esResults || esResults.length === 0) {
      return [];
    }

    // 第二步：从 MongoDB 批量查询完整数据
    const articleIds = esResults.map((item) => item.articleId);
    const documents = await this.databaseService.findRawContentsByIds(articleIds);

    // 按照 ES 返回的顺序和得分重新排序
    const scoreMap = new Map(esResults.map((item) => [item.articleId, item.score]));

    return documents
      .map((doc) => ({
        id: doc._id.toString(),
        score: scoreMap.get(doc._id.toString()) || 0,
        ...doc.toObject(),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  async getPopularTags(size: number = 20) {
    return await this.elasticsearchService.aggregateTags(size);
  }

  async getTrending(days: number = 7, size: number = 30) {
    return await this.databaseService.getTrendingContent(days, size);
  }
}
