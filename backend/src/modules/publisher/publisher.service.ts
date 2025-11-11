import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as playwright from 'playwright';
import { DatabaseService } from '../database/database.service';
import { Content } from '../database/schemas/content.schema';

export interface PublishContent {
  id: string;  // 改为 string 类型，与 MongoDB _id 一致
  title: string;
  content: string;
  imagePath?: string;
  tags?: string[];
}

export interface PublishResult {
  success: boolean;
  publishedAt?: Date;
  error?: string;
}

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    @InjectQueue('publish') private publishQueue: Queue,
    private databaseService: DatabaseService,
  ) {}

  async addPublishJob(content: PublishContent) {
    return await this.publishQueue.add('publish', { content });
  }

  async publishToXiaohongshu(content: PublishContent): Promise<PublishResult> {
    const browser = await playwright.chromium.launch({
      headless: false, // 设置为 false 以便手动处理登录
    });

    try {
      const page = await browser.newPage();

      // 登录逻辑
      await this.login(page);

      // 导航到发布页面
      await page.goto('https://creator.xiaohongshu.com/publish/publish');
      await page.waitForLoadState('networkidle');

      // 等待页面加载
      await page.waitForTimeout(2000);

      // 上传图片（如果有）
      if (content.imagePath) {
        try {
          const fileInput = await page.locator('input[type="file"]').first();
          await fileInput.setInputFiles(content.imagePath);
          await page.waitForTimeout(2000);
        } catch (error) {
          this.logger.warn('Image upload failed, continuing without image');
        }
      }

      // 填写标题
      const titleSelector = '[placeholder*="填写标题"], [placeholder*="title"]';
      await page.waitForSelector(titleSelector, { timeout: 10000 });
      await page.fill(titleSelector, content.title);

      // 填写正文
      const contentSelector = '[placeholder*="填写正文"], [placeholder*="content"]';
      await page.waitForSelector(contentSelector, { timeout: 10000 });

      // 组合标签和内容
      const fullContent = content.tags
        ? `${content.content}\n\n${content.tags.map(tag => `#${tag}`).join(' ')}`
        : content.content;

      await page.fill(contentSelector, fullContent);

      // 等待一下让用户检查
      await page.waitForTimeout(3000);

      // 点击发布按钮
      const publishButton = page.locator('button:has-text("发布"), button[type="submit"]').first();
      await publishButton.click();

      // 等待发布完成
      await page.waitForTimeout(5000);

      this.logger.log(`Content published successfully: ${content.title}`);

      // 更新数据库
      await this.databaseService.updateContentStatus(
        content.id,
        'published',
        new Date(),
      );

      return {
        success: true,
        publishedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Publish failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await browser.close();
    }
  }

  private async login(page: any): Promise<void> {
    try {
      // 导航到登录页面
      await page.goto('https://creator.xiaohongshu.com');
      await page.waitForLoadState('networkidle');

      // 检查是否已登录
      const isLoggedIn = await page.locator('[class*="user"], [class*="avatar"]').count() > 0;

      if (isLoggedIn) {
        this.logger.log('Already logged in');
        return;
      }

      // 如果有配置的账号密码，尝试自动登录
      const email = process.env.XIAOHONGSHU_EMAIL;
      const password = process.env.XIAOHONGSHU_PASSWORD;

      if (email && password) {
        try {
          // 这里需要根据实际的登录页面结构来实现
          await page.fill('input[type="email"], input[name="email"]', email);
          await page.fill('input[type="password"], input[name="password"]', password);
          await page.click('button[type="submit"]');
          await page.waitForLoadState('networkidle');
        } catch (error) {
          this.logger.warn('Auto login failed, please login manually');
        }
      }

      // 等待手动登录或二维码扫描
      this.logger.log('Waiting for manual login...');
      await page.waitForURL('**/creator.xiaohongshu.com/**', { timeout: 120000 });
      this.logger.log('Login successful');
    } catch (error) {
      this.logger.error(`Login failed: ${error.message}`);
      throw error;
    }
  }

  async getPendingContent(): Promise<Content[]> {
    return await this.databaseService.findPendingContent();
  }

  async publishBatch(limit: number = 3): Promise<PublishResult[]> {
    const contents = await this.getPendingContent();
    const toPublish = contents.slice(0, limit);

    const results: PublishResult[] = [];

    for (const content of toPublish) {
      const result = await this.publishToXiaohongshu({
        id: (content as any)._id?.toString() || '', // MongoDB _id
        title: content.title,
        content: content.content,
        imagePath: content.imageUrl,
        tags: content.tags,
      });

      results.push(result);

      // 发布间隔，避免被限制
      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 60000)); // 等待1分钟
      }
    }

    return results;
  }
}
