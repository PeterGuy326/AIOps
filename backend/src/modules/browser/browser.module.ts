import { Module, forwardRef } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserSessionService } from './browser-session.service';
import { LoginCheckService } from './login-check.service';
import { AIModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [forwardRef(() => AIModule), DatabaseModule],
  controllers: [BrowserController],
  providers: [BrowserSessionService, LoginCheckService],
  exports: [BrowserSessionService, LoginCheckService],
})
export class BrowserModule {}
