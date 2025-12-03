import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { CrawlerService, CrawlJobData, PlatformType } from './crawler.service';

/**
 * 爬虫控制器 - 三段式 RESTful API
 * 格式: /crawler/{action}/{method}
 */
@Controller('crawler')
export class CrawlerController {
  constructor(private crawlerService: CrawlerService) {}

  /**
   * GET /crawler/platform/list
   * 获取支持的平台列表
   */
  @Get('platform/list')
  getPlatforms() {
    return {
      platforms: this.crawlerService.getAvailablePlatforms(),
      message: '支持的平台列表',
    };
  }

  /**
   * POST /crawler/job/add
   * 添加爬取任务到队列（异步）
   */
  @Post('job/add')
  async addJob(@Body() jobData: CrawlJobData) {
    const job = await this.crawlerService.addCrawlJob(jobData);
    return {
      message: '爬取任务已加入队列',
      jobId: job.id,
      platform: jobData.platform,
    };
  }

  /**
   * POST /crawler/task/execute
   * 立即执行单平台爬取（同步）
   * @param streaming 是否流式输出实时日志
   * @param includeLogs 是否返回 AI 思考过程日志
   */
  @Post('task/execute')
  async executeTask(
    @Body() body: { platform: PlatformType; keyword?: string; streaming?: boolean; includeLogs?: boolean },
  ) {
    const result = await this.crawlerService.crawlPlatform(
      body.platform,
      body.keyword,
      body.streaming || false,
      body.includeLogs || false,
    );
    return {
      message: '爬取完成',
      platform: body.platform,
      success: result.success,
      articles: result.totalCrawled,
      errors: result.errors,
      logs: result.logs, // AI 思考过程日志
      taskId: result.taskId, // 任务 ID（可用于查询更详细的日志）
    };
  }

  /**
   * POST /crawler/task/execute-all
   * 执行全平台爬取
   * @param streaming 是否流式输出实时日志
   */
  @Post('task/execute-all')
  async executeAllTasks(@Body() body: { keywords?: string[]; streaming?: boolean }) {
    const results = await this.crawlerService.crawlAllPlatforms(body.keywords, body.streaming || false);

    return {
      message: '全平台爬取完成',
      platforms: results.length,
      successful: results.filter((r) => r.success).length,
      totalArticles: results.reduce((sum, r) => sum + r.totalCrawled, 0),
      results: results.map((r) => ({
        platform: r.platform,
        success: r.success,
        articles: r.totalCrawled,
        errors: r.errors,
      })),
    };
  }

  /**
   * POST /crawler/schedule/trigger
   * 触发定时爬取任务
   */
  @Post('schedule/trigger')
  async scheduleTrigger() {
    await this.crawlerService.scheduleCrawlHotContent();
    return {
      message: '定时爬取任务已触发',
    };
  }
}
