import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ClaudeMCPService } from './claude-mcp.service';

export interface GeneratedContent {
  title: string;
  content: string;
  tags: string[];
  imagePrompt: string;
}

export interface Strategy {
  keywords: string[];
  minLikes: number;
  contentType: string;
  negativeKeywords: string[];
  trendInsight: string;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private databaseService: DatabaseService,
    private claudeMCPService: ClaudeMCPService,
  ) {}

  /**
   * 生成内容
   * @param rawData 原始数据
   * @param strategy 策略
   * @param streaming 是否流式输出
   */
  async generateContent(rawData: any[], strategy: any, streaming: boolean = false): Promise<GeneratedContent[]> {
    try {
      this.logger.log('使用本地 MCP 生成内容...');

      if (!this.claudeMCPService.isReady()) {
        throw new Error('MCP 服务未连接，无法生成内容');
      }

      const prompt = `
你是一位专业的小红书内容创作者。基于以下全网热点数据和策略，生成3篇小红书爆款文案。

全网热点数据（按点赞数排序）：
${JSON.stringify(rawData.slice(0, 10), null, 2)}

当前策略：
${JSON.stringify(strategy, null, 2)}

要求：
1. 风格：${strategy?.style || '年轻活力、真实接地气'}
2. 包含emoji和热门标签
3. 字数控制在200字以内
4. 标题吸引人，正文真实有价值
5. 为每篇内容生成配图提示词

请返回JSON格式数组：
[
  {
    "title": "标题",
    "content": "正文内容",
    "tags": ["标签1", "标签2", "标签3"],
    "imagePrompt": "配图生成提示词"
  }
]

只返回JSON数组，不要其他内容。
      `;

      const response = await this.claudeMCPService.execute(prompt, streaming);

      // 提取 JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const generated = JSON.parse(jsonMatch[0]);
        this.logger.log(`Generated ${generated.length} contents`);
        return generated;
      }

      throw new Error('Failed to parse MCP response');
    } catch (error) {
      this.logger.error('Content generation failed:', error);
      throw error;
    }
  }

  /**
   * 生成策略
   * @param analyticsData 分析数据
   * @param streaming 是否流式输出
   */
  async generateStrategy(analyticsData: any, streaming: boolean = false): Promise<Strategy> {
    try {
      this.logger.log('使用本地 MCP 生成策略...');

      if (!this.claudeMCPService.isReady()) {
        throw new Error('MCP 服务未连接，无法生成策略');
      }

      const prompt = `
你是一位专业的数据分析师和运营策略师。基于以下运营数据，生成下一轮内容爬取和创作策略。

运营数据分析：
${JSON.stringify(analyticsData, null, 2)}

请分析：
1. 哪些类型的内容表现最好？
2. 什么样的话题和关键词最受欢迎？
3. 应该避免哪些话题和关键词？
4. 当前的趋势洞察是什么？

返回JSON格式：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "minLikes": 最低点赞数要求,
  "contentType": "内容类型",
  "negativeKeywords": ["避免词1", "避免词2"],
  "trendInsight": "趋势洞察分析"
}

只返回JSON对象，不要其他内容。
      `;

      const response = await this.claudeMCPService.execute(prompt, streaming);

      // 提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const strategy = JSON.parse(jsonMatch[0]);
        this.logger.log('Strategy generated successfully');

        // 保存策略到数据库
        await this.databaseService.saveStrategy({
          keywords: strategy.keywords,
          minLikes: strategy.minLikes,
          contentType: strategy.contentType,
          negativeKeywords: strategy.negativeKeywords,
          trendInsight: strategy.trendInsight,
          status: 'active',
        });

        return strategy;
      }

      throw new Error('Failed to parse MCP response');
    } catch (error) {
      this.logger.error('Strategy generation failed:', error);
      throw error;
    }
  }

  /**
   * 分析内容
   * @param content 内容
   * @param streaming 是否流式输出
   */
  async analyzeContent(content: string, streaming: boolean = false): Promise<any> {
    try {
      this.logger.log('使用本地 MCP 分析内容...');

      if (!this.claudeMCPService.isReady()) {
        throw new Error('MCP 服务未连接，无法分析内容');
      }

      const prompt = `
分析以下内容的质量和潜在表现：
${content}

返回JSON格式：
{
  "quality_score": 评分(0-100),
  "engagement_prediction": 预测互动率,
  "suggestions": ["改进建议1", "改进建议2"],
  "sentiment": "情感倾向"
}
      `;

      const response = await this.claudeMCPService.execute(prompt, streaming);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to parse MCP response');
    } catch (error) {
      this.logger.error('Content analysis failed:', error);
      throw error;
    }
  }
}
