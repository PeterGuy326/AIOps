import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from './entities/site.entity';
import { RawContent } from './entities/raw-content.entity';
import { Content } from './entities/content.entity';
import { Strategy } from './entities/strategy.entity';
import { CliHistory } from './entities/cli-history.entity';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Site)
    private siteRepository: Repository<Site>,
    @InjectRepository(RawContent)
    private rawContentRepository: Repository<RawContent>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Strategy)
    private strategyRepository: Repository<Strategy>,
    @InjectRepository(CliHistory)
    private cliHistoryRepository: Repository<CliHistory>,
  ) {}

  // Site operations
  async createSite(siteData: Partial<Site>): Promise<Site> {
    const site = this.siteRepository.create(siteData);
    return await this.siteRepository.save(site);
  }

  async findAllSites(): Promise<Site[]> {
    return await this.siteRepository.find();
  }

  // Raw Content operations
  async saveRawContent(contentData: Partial<RawContent>): Promise<RawContent> {
    const content = this.rawContentRepository.create(contentData);
    return await this.rawContentRepository.save(content);
  }

  async findRawContentByDateRange(startDate: Date, endDate: Date): Promise<RawContent[]> {
    return await this.rawContentRepository
      .createQueryBuilder('rawContent')
      .where('rawContent.crawledAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('rawContent.likes', 'DESC')
      .getMany();
  }

  // Content operations
  async createContent(contentData: Partial<Content>): Promise<Content> {
    const content = this.contentRepository.create(contentData);
    return await this.contentRepository.save(content);
  }

  async findPendingContent(): Promise<Content[]> {
    return await this.contentRepository.find({
      where: { status: 'pending' },
    });
  }

  async updateContentStatus(id: number, status: string, publishedAt?: Date): Promise<void> {
    await this.contentRepository.update(id, { status, publishedAt });
  }

  // Strategy operations
  async saveStrategy(strategyData: Partial<Strategy>): Promise<Strategy> {
    const strategy = this.strategyRepository.create(strategyData);
    return await this.strategyRepository.save(strategy);
  }

  async getLatestStrategy(): Promise<Strategy> {
    return await this.strategyRepository.findOne({
      where: { status: 'active' },
      order: { createdAt: 'DESC' },
    });
  }

  // CLI History operations
  async saveCliHistory(question: string, answer: string): Promise<CliHistory> {
    const history = this.cliHistoryRepository.create({ question, answer });
    return await this.cliHistoryRepository.save(history);
  }

  async query(sql: string, params?: any[]): Promise<any> {
    return await this.siteRepository.query(sql, params);
  }
}
