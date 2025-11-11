import { Controller, Get, Query, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

/**
 * 分析控制器 - 三段式 RESTful API
 * 格式: /analytics/{action}/{method}
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  /**
   * GET /analytics/stats/performance
   * 获取性能分析统计
   */
  @Get('stats/performance')
  async getPerformance(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 7;
    const metrics = await this.analyticsService.analyzePerformance(daysNum);
    return {
      message: '性能分析完成',
      metrics,
    };
  }

  /**
   * GET /analytics/stats/daily
   * 获取每日统计数据
   */
  @Get('stats/daily')
  async getDailyStats(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 30;
    const stats = await this.analyticsService.getDailyStats(daysNum);
    return {
      message: '每日统计数据获取成功',
      stats,
    };
  }

  /**
   * GET /analytics/content/trending
   * 获取热门话题
   */
  @Get('content/trending')
  async getTrending(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days) : 7;
    const topics = await this.analyticsService.getTrendingTopics(daysNum);
    return {
      message: '热门话题获取成功',
      topics,
    };
  }

  /**
   * GET /analytics/content/detail
   * 获取单个内容的性能详情
   */
  @Get('content/detail')
  async getContentDetail(@Query('id') id: string) {
    const content = await this.analyticsService.getContentPerformanceById(
      parseInt(id),
    );
    return {
      message: '内容性能详情获取成功',
      content,
    };
  }
}
