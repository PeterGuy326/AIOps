import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as playwright from 'playwright';
import { DatabaseService } from '../database/database.service';
import { Site } from '../database/entities/site.entity';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SiteConfig {
  url: string;
  selectors?: Record<string, any>;
  name?: string;
}

export interface CrawledData {
  title: string;
  link: string;
  author: string;
  likes: number;
  content: string;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  constructor(
    @InjectQueue('crawl') private crawlQueue: Queue,
    private databaseService: DatabaseService,
  ) {}

  async addCrawlJob(siteConfig: SiteConfig) {
    return await this.crawlQueue.add('crawl', { siteConfig });
  }

  async crawlWithFallback(siteConfig: SiteConfig): Promise<CrawledData[]> {
    try {
      this.logger.log(`Starting crawl for ${siteConfig.url}`);

      // 尝试传统爬取
      let data = await this.crawlWithPlaywright(siteConfig);

      // 验证数据
      if (!this.isValidData(data)) {
        this.logger.warn('Playwright crawl failed, trying AI fallback');
        data = await this.crawlWithAI(siteConfig);
      }

      return this.standardizeData(data);
    } catch (error) {
      this.logger.error(`Crawl failed for ${siteConfig.url}:`, error);
      throw error;
    }
  }

  private async crawlWithPlaywright(config: SiteConfig): Promise<any[]> {
    const browser = await playwright.chromium.launch({
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(config.url, { waitUntil: 'networkidle' });

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 使用配置的选择器提取数据
      const data = await page.evaluate((selectors) => {
        const items = [];
        const elements = document.querySelectorAll(selectors.itemSelector || '.note-item');

        elements.forEach(el => {
          const titleEl = el.querySelector(selectors.titleSelector || '.title');
          const authorEl = el.querySelector(selectors.authorSelector || '.author');
          const likesEl = el.querySelector(selectors.likesSelector || '.likes');
          const linkEl = el.querySelector(selectors.linkSelector || 'a');

          items.push({
            title: titleEl?.textContent?.trim() || '',
            author: authorEl?.textContent?.trim() || '',
            likes: parseInt(likesEl?.textContent?.replace(/[^\d]/g, '') || '0'),
            link: linkEl?.getAttribute('href') || '',
            content: titleEl?.textContent?.trim() || '',
          });
        });

        return items;
      }, config.selectors || {});

      return data;
    } finally {
      await browser.close();
    }
  }

  private async crawlWithAI(config: SiteConfig): Promise<CrawledData[]> {
    try {
      const prompt = `
使用浏览器访问 ${config.url}
提取所有文章信息，返回JSON格式数组：
[{
  "title": "文章标题",
  "link": "文章链接",
  "author": "作者",
  "likes": 点赞数(数字),
  "content": "文章摘要"
}]
只返回JSON数据，不要其他内容。
      `;

      // 这里假设已安装 claude-code CLI
      // 实际使用时需要确保 claude-code 可用
      const { stdout } = await execAsync(`echo "${prompt}" | claude-code`);

      // 尝试解析 JSON
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return [];
    } catch (error) {
      this.logger.error('AI crawl failed:', error);
      return [];
    }
  }

  private isValidData(data: any[]): boolean {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }

    // 检查数据结构
    const firstItem = data[0];
    return firstItem && typeof firstItem === 'object' &&
           ('title' in firstItem || 'content' in firstItem);
  }

  private standardizeData(data: any[]): CrawledData[] {
    return data.map(item => ({
      title: item.title || '',
      link: item.link || item.url || '',
      author: item.author || 'Unknown',
      likes: parseInt(item.likes) || 0,
      content: item.content || item.description || '',
    }));
  }

  async saveCrawledData(siteId: number, data: CrawledData[]): Promise<void> {
    for (const item of data) {
      await this.databaseService.saveRawContent({
        siteId,
        title: item.title,
        content: item.content,
        author: item.author,
        likes: item.likes,
        url: item.link,
      });
    }

    this.logger.log(`Saved ${data.length} items from site ${siteId}`);
  }
}
