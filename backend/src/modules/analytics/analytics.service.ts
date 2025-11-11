import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface PerformanceMetrics {
  totalLikes: number;
  avgEngagement: number;
  topPerforming: any[];
  lowPerforming: any[];
  totalPublished: number;
  publishRate: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private databaseService: DatabaseService) {}

  async analyzePerformance(days: number = 7): Promise<PerformanceMetrics> {
    try {
      this.logger.log(`Analyzing performance for last ${days} days`);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 获取已发布内容
      const contents = await this.databaseService.query(
        `
        SELECT * FROM contents
        WHERE status = 'published'
        AND published_at > $1
        ORDER BY likes DESC
        `,
        [startDate],
      );

      if (contents.length === 0) {
        return {
          totalLikes: 0,
          avgEngagement: 0,
          topPerforming: [],
          lowPerforming: [],
          totalPublished: 0,
          publishRate: 0,
        };
      }

      // 计算指标
      const totalLikes = contents.reduce((sum, item) => sum + (item.likes || 0), 0);
      const totalComments = contents.reduce((sum, item) => sum + (item.comments || 0), 0);
      const avgEngagement = ((totalLikes + totalComments) / contents.length).toFixed(2);

      // 找出表现好的和差的内容
      const topPerforming = contents.filter(item => item.likes > 1000);
      const lowPerforming = contents.filter(item => item.likes < 100);

      const metrics: PerformanceMetrics = {
        totalLikes,
        avgEngagement: parseFloat(avgEngagement),
        topPerforming,
        lowPerforming,
        totalPublished: contents.length,
        publishRate: (contents.length / days).toFixed(2) as any,
      };

      this.logger.log(`Performance analysis completed: ${JSON.stringify(metrics)}`);

      return metrics;
    } catch (error) {
      this.logger.error('Performance analysis failed:', error);
      throw error;
    }
  }

  async getTrendingTopics(days: number = 7): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const rawContents = await this.databaseService.query(
        `
        SELECT title, likes, content
        FROM raw_content
        WHERE crawled_at > $1
        ORDER BY likes DESC
        LIMIT 100
        `,
        [startDate],
      );

      // 简单的关键词提取（实际应该使用更复杂的NLP）
      const keywordMap = new Map();

      rawContents.forEach(item => {
        const text = (item.title + ' ' + item.content).toLowerCase();
        // 简单的分词（实际应该使用专业的分词工具）
        const words = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];

        words.forEach(word => {
          if (word.length >= 2) {
            const count = keywordMap.get(word) || 0;
            keywordMap.set(word, count + 1);
          }
        });
      });

      // 排序并返回前20个
      const trending = Array.from(keywordMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([keyword, count]) => ({ keyword, count }));

      this.logger.log(`Found ${trending.length} trending topics`);

      return trending;
    } catch (error) {
      this.logger.error('Trending topics analysis failed:', error);
      throw error;
    }
  }

  async getContentPerformanceById(contentId: number): Promise<any> {
    try {
      const content = await this.databaseService.query(
        'SELECT * FROM contents WHERE id = $1',
        [contentId],
      );

      if (content.length === 0) {
        return null;
      }

      return content[0];
    } catch (error) {
      this.logger.error('Content performance fetch failed:', error);
      throw error;
    }
  }

  async getDailyStats(days: number = 30): Promise<any[]> {
    try {
      const stats = await this.databaseService.query(
        `
        SELECT
          DATE(published_at) as date,
          COUNT(*) as published_count,
          SUM(likes) as total_likes,
          AVG(likes) as avg_likes,
          SUM(comments) as total_comments
        FROM contents
        WHERE status = 'published'
        AND published_at > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(published_at)
        ORDER BY date DESC
        `,
      );

      return stats;
    } catch (error) {
      this.logger.error('Daily stats fetch failed:', error);
      throw error;
    }
  }
}
