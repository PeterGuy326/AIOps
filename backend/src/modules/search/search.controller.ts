import { Controller, Get, Query, Param } from '@nestjs/common';
import { SearchService } from './search.service';

/**
 * Search 控制器 - 三段式 RESTful API
 * 格式: /search/{action}/{method}
 */
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search/content/list
   * 获取所有爬取的内容列表（分页）
   */
  @Get('content/list')
  async getAllContents(
    @Query('platform') platform?: string,
    @Query('from') from?: string,
    @Query('size') size?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return await this.searchService.getAllContents({
      platform,
      from: from ? parseInt(from) : 0,
      size: size ? parseInt(size) : 20,
      sortBy: sortBy || 'crawledAt',
      sortOrder: sortOrder || 'desc',
    });
  }

  /**
   * GET /search/content/query
   * 搜索内容
   */
  @Get('content/query')
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

  /**
   * GET /search/content/similar/:id
   * 查找相似内容
   */
  @Get('content/similar/:id')
  async findSimilar(
    @Param('id') id: string,
    @Query('size') size?: string,
  ) {
    const sizeNum = size ? parseInt(size) : 5;
    return await this.searchService.findSimilar(id, sizeNum);
  }

  /**
   * GET /search/tag/popular
   * 获取热门标签
   */
  @Get('tag/popular')
  async getPopularTags(@Query('size') size?: string) {
    const sizeNum = size ? parseInt(size) : 20;
    return await this.searchService.getPopularTags(sizeNum);
  }

  /**
   * GET /search/content/trending
   * 获取热门内容
   */
  @Get('content/trending')
  async getTrending(
    @Query('days') days?: string,
    @Query('size') size?: string,
  ) {
    const daysNum = days ? parseInt(days) : 7;
    const sizeNum = size ? parseInt(size) : 30;
    return await this.searchService.getTrending(daysNum, sizeNum);
  }
}
