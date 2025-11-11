import { Controller, Post, Get, Body } from '@nestjs/common';
import { PublisherService } from './publisher.service';

/**
 * 发布控制器 - 三段式 RESTful API
 * 格式: /publisher/{action}/{method}
 */
@Controller('publisher')
export class PublisherController {
  constructor(private publisherService: PublisherService) {}

  /**
   * POST /publisher/job/add
   * 添加发布任务到队列（异步）
   */
  @Post('job/add')
  async addJob(@Body() content: any) {
    const job = await this.publisherService.addPublishJob(content);
    return {
      message: '发布任务已加入队列',
      jobId: job.id,
    };
  }

  /**
   * POST /publisher/content/publish
   * 立即发布内容（同步）
   */
  @Post('content/publish')
  async publishNow(@Body() content: any) {
    const result = await this.publisherService.publishToXiaohongshu(content);
    return {
      message: result.success ? '发布成功' : '发布失败',
      result,
    };
  }

  /**
   * POST /publisher/content/publish-batch
   * 批量发布内容
   */
  @Post('content/publish-batch')
  async publishBatch(@Body() data: { limit?: number }) {
    const results = await this.publisherService.publishBatch(data.limit);
    return {
      message: '批量发布完成',
      results,
      success: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }

  /**
   * GET /publisher/content/pending
   * 获取待发布内容列表
   */
  @Get('content/pending')
  async getPending() {
    const contents = await this.publisherService.getPendingContent();
    return {
      count: contents.length,
      contents,
    };
  }
}
