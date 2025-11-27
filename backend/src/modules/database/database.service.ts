import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Site, SiteDocument } from './schemas/site.schema';
import { RawContent, RawContentDocument } from './schemas/raw-content.schema';
import { Content, ContentDocument } from './schemas/content.schema';
import { Strategy, StrategyDocument } from './schemas/strategy.schema';
import { CliHistory, CliHistoryDocument } from './schemas/cli-history.schema';
import { UserInterest, UserInterestDocument } from './schemas/user-interest.schema';
import { CrawlTemplate, CrawlTemplateDocument } from './schemas/crawl-template.schema';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectModel(Site.name)
    private siteModel: Model<SiteDocument>,
    @InjectModel(RawContent.name)
    private rawContentModel: Model<RawContentDocument>,
    @InjectModel(Content.name)
    private contentModel: Model<ContentDocument>,
    @InjectModel(Strategy.name)
    private strategyModel: Model<StrategyDocument>,
    @InjectModel(CliHistory.name)
    private cliHistoryModel: Model<CliHistoryDocument>,
    @InjectModel(UserInterest.name)
    private userInterestModel: Model<UserInterestDocument>,
    @InjectModel(CrawlTemplate.name)
    private crawlTemplateModel: Model<CrawlTemplateDocument>,
    private elasticsearchService: ElasticsearchService,
  ) {}

  // Site operations
  async createSite(siteData: Partial<Site>): Promise<Site> {
    const site = new this.siteModel(siteData);
    return await site.save();
  }

  async findAllSites(): Promise<Site[]> {
    return await this.siteModel.find().exec();
  }

  // Raw Content operations
  async saveRawContent(contentData: Partial<RawContent & { metadata?: any }>): Promise<RawContentDocument> {
    const { metadata, ...data } = contentData;

    // 处理元数据，提取特定字段
    let enrichedData: any = { ...data };
    if (metadata) {
      enrichedData = {
        ...enrichedData,
        platform: metadata.platform,
        tags: metadata.tags,
        publishTime: metadata.publishTime,
        metadata: metadata, // 保存完整元数据
      };
    }

    const content = new this.rawContentModel(enrichedData);
    return await content.save();
  }

  /**
   * 同步内容到 Elasticsearch
   * @param articleId MongoDB 文档 _id
   * @param esData 要存储到 ES 的数据（包含 fullContent）
   */
  async syncToElasticsearch(articleId: string, esData: any): Promise<void> {
    try {
      await this.elasticsearchService.indexDocument(articleId, {
        articleId, // 存储 MongoDB ID 作为关联字段
        ...esData,
      });
    } catch (error) {
      console.error(`ES 同步失败 [${articleId}]:`, error.message);
      // 不抛出异常，避免影响主流程
    }
  }

  async findRawContentByUrl(url: string): Promise<RawContent | null> {
    return await this.rawContentModel.findOne({ url }).exec();
  }

  /**
   * 根据 ID 列表批量查询原始内容
   * @param ids MongoDB _id 列表
   */
  async findRawContentsByIds(ids: string[]): Promise<RawContentDocument[]> {
    return await this.rawContentModel.find({ _id: { $in: ids } }).exec();
  }

  async findRawContentByDateRange(startDate: Date, endDate: Date): Promise<RawContent[]> {
    return await this.rawContentModel
      .find({
        crawledAt: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ likes: -1 })
      .exec();
  }

  async findRawContentByPlatform(platform: string, limit: number = 50): Promise<RawContent[]> {
    return await this.rawContentModel
      .find({ platform })
      .sort({ crawledAt: -1 })
      .limit(limit)
      .exec();
  }

  async getTrendingContent(days: number = 7, limit: number = 30): Promise<RawContent[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await this.rawContentModel
      .find({
        crawledAt: { $gte: startDate },
        likes: { $gt: 0 },
      })
      .sort({ likes: -1, crawledAt: -1 })
      .limit(limit)
      .exec();
  }

  // Content operations
  async createContent(contentData: Partial<Content>): Promise<Content> {
    const content = new this.contentModel(contentData);
    return await content.save();
  }

  async findPendingContent(): Promise<Content[]> {
    return await this.contentModel.find({ status: 'pending' }).exec();
  }

  async updateContentStatus(id: string, status: string, publishedAt?: Date): Promise<void> {
    const updateData: any = { status };
    if (publishedAt) {
      updateData.publishedAt = publishedAt;
    }
    await this.contentModel.findByIdAndUpdate(id, updateData).exec();
  }

  // Strategy operations
  async saveStrategy(strategyData: Partial<Strategy>): Promise<Strategy> {
    const strategy = new this.strategyModel(strategyData);
    return await strategy.save();
  }

  async getLatestStrategy(): Promise<Strategy> {
    return await this.strategyModel
      .findOne({ status: 'active' })
      .sort({ createdAt: -1 })
      .exec();
  }

  // CLI History operations
  async saveCliHistory(question: string, answer: string): Promise<CliHistory> {
    const history = new this.cliHistoryModel({ question, answer });
    return await history.save();
  }

  // Strategy extended operations
  async getStrategies(): Promise<Strategy[]> {
    return await this.strategyModel.find().sort({ createdAt: -1 }).exec();
  }

  async updateStrategy(id: string, updates: Partial<Strategy>): Promise<Strategy | null> {
    return await this.strategyModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
  }

  async getStrategyById(id: string): Promise<Strategy | null> {
    return await this.strategyModel.findById(id).exec();
  }

  async deleteStrategy(id: string): Promise<boolean> {
    const result = await this.strategyModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // User Interest operations
  async getUserInterest(userId: string): Promise<UserInterest | null> {
    return await this.userInterestModel.findOne({ userId }).exec();
  }

  async saveUserInterest(userInterest: Partial<UserInterest>): Promise<UserInterest> {
    const existing = await this.userInterestModel.findOne({ userId: userInterest.userId });
    if (existing) {
      Object.assign(existing, userInterest);
      return await existing.save();
    }
    const newInterest = new this.userInterestModel(userInterest);
    return await newInterest.save();
  }

  async updateUserInterest(userId: string, updates: Partial<UserInterest>): Promise<UserInterest | null> {
    return await this.userInterestModel
      .findOneAndUpdate({ userId }, updates, { new: true, upsert: true })
      .exec();
  }

  // Crawl Template operations
  async saveCrawlTemplate(template: Partial<CrawlTemplate>): Promise<CrawlTemplate> {
    const newTemplate = new this.crawlTemplateModel(template);
    return await newTemplate.save();
  }

  async getCrawlTemplates(category?: string): Promise<CrawlTemplate[]> {
    const query = category ? { category, status: 'active' } : { status: 'active' };
    return await this.crawlTemplateModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async getCrawlTemplate(templateId: string): Promise<CrawlTemplate | null> {
    return await this.crawlTemplateModel.findById(templateId).exec();
  }

  async updateTemplateStats(
    templateId: string,
    stats: { lastRun?: Date; totalRuns?: number; avgArticlesPerRun?: number; successRate?: number },
  ): Promise<void> {
    const template = await this.crawlTemplateModel.findById(templateId);
    if (template) {
      if (stats.lastRun) template.stats.lastRun = stats.lastRun;
      if (stats.totalRuns !== undefined) template.stats.totalRuns += stats.totalRuns;
      if (stats.avgArticlesPerRun !== undefined) {
        // 计算新的平均值
        const currentTotal = template.stats.avgArticlesPerRun * (template.stats.totalRuns - 1);
        template.stats.avgArticlesPerRun = (currentTotal + stats.avgArticlesPerRun) / template.stats.totalRuns;
      }
      if (stats.successRate !== undefined) {
        // 计算加权平均成功率
        const weight = 1 / template.stats.totalRuns;
        template.stats.successRate = template.stats.successRate * (1 - weight) + stats.successRate * weight;
      }
      await template.save();
    }
  }

  async deleteCrawlTemplate(templateId: string): Promise<boolean> {
    const result = await this.crawlTemplateModel.findByIdAndDelete(templateId).exec();
    return !!result;
  }
}
