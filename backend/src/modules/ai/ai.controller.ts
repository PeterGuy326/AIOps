import { Controller, Post, Body } from '@nestjs/common';
import { AIService } from './ai.service';

@Controller('ai')
export class AIController {
  constructor(private aiService: AIService) {}

  @Post('generate-content')
  async generateContent(@Body() data: { rawData: any[]; strategy: any }) {
    const contents = await this.aiService.generateContent(
      data.rawData,
      data.strategy,
    );
    return {
      message: 'Content generated successfully',
      contents,
      count: contents.length,
    };
  }

  @Post('generate-strategy')
  async generateStrategy(@Body() data: { analyticsData: any }) {
    const strategy = await this.aiService.generateStrategy(data.analyticsData);
    return {
      message: 'Strategy generated successfully',
      strategy,
    };
  }

  @Post('analyze-content')
  async analyzeContent(@Body() data: { content: string }) {
    const analysis = await this.aiService.analyzeContent(data.content);
    return {
      message: 'Content analyzed successfully',
      analysis,
    };
  }
}
