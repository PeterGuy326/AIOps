import { Controller, Post, Get, Body } from '@nestjs/common';
import { PublisherService } from './publisher.service';

@Controller('publisher')
export class PublisherController {
  constructor(private publisherService: PublisherService) {}

  @Post('publish')
  async publish(@Body() content: any) {
    const job = await this.publisherService.addPublishJob(content);
    return {
      message: 'Publish job added to queue',
      jobId: job.id,
    };
  }

  @Post('publish-now')
  async publishNow(@Body() content: any) {
    const result = await this.publisherService.publishToXiaohongshu(content);
    return {
      message: result.success ? 'Published successfully' : 'Publish failed',
      result,
    };
  }

  @Post('publish-batch')
  async publishBatch(@Body() data: { limit?: number }) {
    const results = await this.publisherService.publishBatch(data.limit);
    return {
      message: 'Batch publish completed',
      results,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };
  }

  @Get('pending')
  async getPending() {
    const contents = await this.publisherService.getPendingContent();
    return {
      count: contents.length,
      contents,
    };
  }
}
