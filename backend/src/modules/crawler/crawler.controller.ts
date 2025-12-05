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
   * 执行单平台爬取（异步，立即返回任务 ID）
   * 任务在后台执行，结果落库，可通过 taskId 查询��度
   */
  @Post('task/execute')
  async executeTask(
    @Body() body: { platform: PlatformType; keyword?: string; streaming?: boolean; includeLogs?: boolean },
  ) {
    const taskId = await this.crawlerService.crawlPlatformAsync(
      body.platform,
      body.keyword,
      body.streaming || false,
      body.includeLogs || false,
    );

    return {
      message: '爬取任务已提交，后台执行中',
      taskId,
      platform: body.platform,
      keyword: body.keyword,
      // 前端可通过 /ai/task/detail/{taskId} 查询进度和结果
      queryUrl: `/ai/task/detail/${taskId}`,
    };
  }

  /**
   * POST /crawler/task/execute-sync
   * 同步执行单平台爬取（等待完成后返回结果）
   * @deprecated 建议使用异步接口 /crawler/task/execute
   */
  @Post('task/execute-sync')
  async executeTaskSync(
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
      logs: result.logs,
      taskId: result.taskId,
    };
  }

  /**
   * POST /crawler/task/execute-all
   * 执行全平台爬取（异步）
   */
  @Post('task/execute-all')
  async executeAllTasks(@Body() body: { keywords?: string[]; streaming?: boolean }) {
    const taskIds = await this.crawlerService.crawlAllPlatformsAsync(body.keywords, body.streaming || false);

    return {
      message: '全平台爬取任务已提交，后台执行中',
      taskIds,
      platforms: taskIds.length,
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
