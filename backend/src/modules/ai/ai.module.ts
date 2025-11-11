import { Module, forwardRef } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { ClaudeMCPService } from './claude-mcp.service';
import { DatabaseModule } from '../database/database.module';
import { CrawlerModule } from '../crawler/crawler.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => CrawlerModule)],
  controllers: [AIController],
  providers: [AIService, ClaudeMCPService],
  exports: [AIService, ClaudeMCPService],
})
export class AIModule {}
