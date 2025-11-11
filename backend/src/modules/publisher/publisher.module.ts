import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PublisherService } from './publisher.service';
import { PublisherController } from './publisher.controller';
import { PublisherProcessor } from './publisher.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'publish',
    }),
  ],
  controllers: [PublisherController],
  providers: [PublisherService, PublisherProcessor],
  exports: [PublisherService],
})
export class PublisherModule {}
