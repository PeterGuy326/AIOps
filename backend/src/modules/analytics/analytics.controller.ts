import { Controller, Get, Query, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('performance')
  async getPerformance(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 7;
    const metrics = await this.analyticsService.analyzePerformance(daysNum);
    return {
      message: 'Performance analysis completed',
      metrics,
    };
  }

  @Get('trending')
  async getTrending(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 7;
    const topics = await this.analyticsService.getTrendingTopics(daysNum);
    return {
      message: 'Trending topics fetched',
      topics,
    };
  }

  @Get('content/:id')
  async getContentPerformance(@Param('id') id: string) {
    const content = await this.analyticsService.getContentPerformanceById(
      parseInt(id),
    );
    return {
      message: 'Content performance fetched',
      content,
    };
  }

  @Get('daily-stats')
  async getDailyStats(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 30;
    const stats = await this.analyticsService.getDailyStats(daysNum);
    return {
      message: 'Daily stats fetched',
      stats,
    };
  }
}
