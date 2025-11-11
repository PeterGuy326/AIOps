import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CliService } from './cli.service';

/**
 * CLI 控制器 - 三段式 RESTful API
 * 格式: /cli/{action}/{method}
 */
@Controller('cli')
export class CliController {
  constructor(private cliService: CliService) {}

  /**
   * POST /cli/history/save
   * 保存命令历史记录
   */
  @Post('history/save')
  async saveHistory(@Body() data: { question: string; answer: string }) {
    await this.cliService.saveHistory(data.question, data.answer);
    return {
      message: '历史记录保存成功',
    };
  }

  /**
   * GET /cli/history/list
   * 获取历史记录列表
   */
  @Get('history/list')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 50;
    const offsetNum = offset ? parseInt(offset) : 0;

    const history = await this.cliService.getHistory(limitNum, offsetNum);

    return {
      message: '历史记录获取成功',
      history,
      count: history.length,
    };
  }

  /**
   * GET /cli/history/search
   * 搜索历史记录
   */
  @Get('history/search')
  async searchHistory(@Query('q') query: string) {
    const history = await this.cliService.searchHistory(query);

    return {
      message: '搜索完成',
      history,
      count: history.length,
    };
  }
}
