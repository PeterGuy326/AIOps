import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PublisherService } from './publisher.service';

@Processor('publish')
export class PublisherProcessor {
  private readonly logger = new Logger(PublisherProcessor.name);

  constructor(private publisherService: PublisherService) {}

  @Process('publish')
  async handlePublish(job: Job) {
    this.logger.log(`Processing publish job ${job.id}`);
    const { content } = job.data;

    try {
      const result = await this.publisherService.publishToXiaohongshu(content);
      this.logger.log(`Publish ${result.success ? 'succeeded' : 'failed'}`);
      return result;
    } catch (error) {
      this.logger.error(`Publish job ${job.id} failed:`, error);
      throw error;
    }
  }
}
