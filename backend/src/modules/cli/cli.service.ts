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
      await this.databaseService.query(
        `
        INSERT INTO cli_history (question, answer, timestamp)
        VALUES ($1, $2, NOW())
        `,
        [question, answer],
      );

      this.logger.log('CLI history saved successfully');
    } catch (error) {
      this.logger.error('Failed to save CLI history:', error);
      throw error;
    }
  }

  async getHistory(limit: number = 50, offset: number = 0): Promise<CliHistory[]> {
    try {
      const history = await this.databaseService.query(
        `
        SELECT id, question, answer, timestamp
        FROM cli_history
        ORDER BY timestamp DESC
        LIMIT $1 OFFSET $2
        `,
        [limit, offset],
      );

      return history;
    } catch (error) {
      this.logger.error('Failed to get CLI history:', error);
      throw error;
    }
  }

  async searchHistory(query: string): Promise<CliHistory[]> {
    try {
      const history = await this.databaseService.query(
        `
        SELECT id, question, answer, timestamp
        FROM cli_history
        WHERE question ILIKE $1 OR answer ILIKE $1
        ORDER BY timestamp DESC
        LIMIT 50
        `,
        [`%${query}%`],
      );

      return history;
    } catch (error) {
      this.logger.error('Failed to search CLI history:', error);
      throw error;
    }
  }

  async clearHistory(): Promise<void> {
    try {
      await this.databaseService.query('DELETE FROM cli_history');
      this.logger.log('CLI history cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear CLI history:', error);
      throw error;
    }
  }
}
