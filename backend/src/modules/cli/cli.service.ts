import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CliHistory {
  id: number;
  question: string;
  answer: string;
  timestamp: Date;
}

@Injectable()
export class CliService {
  private readonly logger = new Logger(CliService.name);

  constructor(private databaseService: DatabaseService) {}

  async saveHistory(question: string, answer: string): Promise<void> {
    try {
      await this.databaseService.saveCliHistory(question, answer);
      this.logger.log('CLI history saved successfully');
    } catch (error) {
      this.logger.error('Failed to save CLI history:', error);
      throw error;
    }
  }

  async getHistory(limit: number = 50, offset: number = 0): Promise<CliHistory[]> {
    try {
      // TODO: 使用 MongoDB 替代
      this.logger.warn('getHistory needs MongoDB implementation');
      return [];
    } catch (error) {
      this.logger.error('Failed to get CLI history:', error);
      throw error;
    }
  }

  async searchHistory(query: string): Promise<CliHistory[]> {
    try {
      // TODO: 使用 MongoDB 替代
      this.logger.warn('searchHistory needs MongoDB implementation');
      return [];
    } catch (error) {
      this.logger.error('Failed to search CLI history:', error);
      throw error;
    }
  }

  async clearHistory(): Promise<void> {
    try {
      // TODO: 使用 MongoDB 替代
      this.logger.warn('clearHistory needs MongoDB implementation');
      this.logger.log('CLI history cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear CLI history:', error);
      throw error;
    }
  }
}
