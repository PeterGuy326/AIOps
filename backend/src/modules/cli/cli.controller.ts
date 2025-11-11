import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CliService } from './cli.service';

@Controller('cli')
export class CliController {
  constructor(private cliService: CliService) {}

  @Post('history')
  async saveHistory(
    @Body() data: { question: string; answer: string },
  ) {
    await this.cliService.saveHistory(data.question, data.answer);
    return {
      message: 'History saved successfully',
    };
  }

  @Get('history')
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 50;
    const offsetNum = offset ? parseInt(offset) : 0;

    const history = await this.cliService.getHistory(limitNum, offsetNum);

    return {
      message: 'History retrieved successfully',
      history,
      count: history.length,
    };
  }

  @Get('history/search')
  async searchHistory(@Query('q') query: string) {
    const history = await this.cliService.searchHistory(query);

    return {
      message: 'Search completed',
      history,
      count: history.length,
    };
  }
}
