import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseService } from './database.service';
import { Site } from './entities/site.entity';
import { RawContent } from './entities/raw-content.entity';
import { Content } from './entities/content.entity';
import { Strategy } from './entities/strategy.entity';
import { CliHistory } from './entities/cli-history.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      RawContent,
      Content,
      Strategy,
      CliHistory,
    ]),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule {}
