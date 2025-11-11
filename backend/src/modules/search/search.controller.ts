import { Controller, Get, Query, Param } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('platform') platform?: string,
    @Query('tags') tags?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    const options = {
      platform,
      tags: tags ? tags.split(',') : undefined,
      from: from ? parseInt(from) : 0,
      size: size ? parseInt(size) : 10,
      sortBy: sortBy || 'publishTime',
      sortOrder: sortOrder || 'desc',
    };

    return await this.searchService.search(query, options);
  }

  @Get('similar/:id')
  async findSimilar(
    @Param('id') id: string,
    @Query('size') size?: string,
  ) {
    const sizeNum = size ? parseInt(size) : 5;
    return await this.searchService.findSimilar(id, sizeNum);
  }

  @Get('tags')
  async getPopularTags(@Query('size') size?: string) {
    const sizeNum = size ? parseInt(size) : 20;
    return await this.searchService.getPopularTags(sizeNum);
  }

  @Get('trending')
  async getTrending(
    @Query('days') days?: string,
    @Query('size') size?: string,
  ) {
    const daysNum = days ? parseInt(days) : 7;
    const sizeNum = size ? parseInt(size) : 30;
    return await this.searchService.getTrending(daysNum, sizeNum);
  }
}
