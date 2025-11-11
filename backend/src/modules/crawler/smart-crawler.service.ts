import { Injectable, Logger } from '@nestjs/common';
import { ClaudeMCPService } from '../ai/claude-mcp.service';

export interface SmartCrawlResult {
  success: boolean;
  platform: string;
  keyword?: string;
  articles: any[];
  totalCrawled: number;
  errors?: string[];
}

export interface AIStrategySuggestion {
  timeframe: number;
  platforms: Array<{
    name: string;
    weight: number;
    reasoning: string;
  }>;
  keywords: Array<{
    keyword: string;
    priority: number;
    category: string;
    trend: string;
  }>;
  schedule: {
    frequency: string;
    optimalTimes: string[];
    reasoning: string;
  };
  objectives: {
    trending: boolean;
    quality: boolean;
    engagement: boolean;
  };
  expectedResults: {
    articlesPerDay: number;
    qualityScore: number;
    engagementRate: number;
  };
  recommendations: string[];
}

/**
 * 智能爬虫服务 - 纯 MCP 实现
 * 让 Claude 自己决定如何爬取，无需预定义选择器
 */
@Injectable()
export class SmartCrawlerService {
  private readonly logger = new Logger(SmartCrawlerService.name);

  constructor(private mcpService: ClaudeMCPService) {}

  /**
   * 智能爬取 - 让 Claude 自己想办法
   */
  async crawl(platform: string, keyword?: string): Promise<SmartCrawlResult> {
    if (!this.mcpService.isReady()) {
      return {
        success: false,
        platform,
        keyword,
        articles: [],
        totalCrawled: 0,
        errors: ['MCP 服务未连接，请在 Claude Code 中运行'],
      };
    }

    try {
      this.logger.log(`🤖 智能爬取: ${platform} ${keyword || '热门内容'}`);

      const url = this.getPlatformUrl(platform, keyword);
      const prompt = this.buildPrompt(platform, url, keyword);

      // 调用 MCP ask_claude 工具
      const result = await this.mcpService.callTool('ask_claude', {
        prompt,
        model: 'claude-sonnet-4-5',
      });

      const articles = this.parseResponse(result);

      this.logger.log(`✅ 爬取完成: ${articles.length} 篇`);

      return {
        success: true,
        platform,
        keyword,
        articles,
        totalCrawled: articles.length,
      };
    } catch (error) {
      this.logger.error(`❌ 爬取失败: ${error.message}`);
      return {
        success: false,
        platform,
        keyword,
        articles: [],
        totalCrawled: 0,
        errors: [error.message],
      };
    }
  }

  /**
   * 获取平台 URL
   */
  private getPlatformUrl(platform: string, keyword?: string): string {
    const urls = {
      zhihu: keyword
        ? `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`
        : 'https://www.zhihu.com/hot',
      wechat: keyword
        ? `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}`
        : 'https://weixin.sogou.com/',
      weibo: keyword
        ? `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`
        : 'https://weibo.com/hot/search',
    };

    return urls[platform] || urls.zhihu;
  }

  /**
   * 构建爬取提示词
   */
  private buildPrompt(platform: string, url: string, keyword?: string): string {
    return `
你是智能爬虫助手。请访问网站并提取内容。

平台: ${platform}
${keyword ? `关键词: ${keyword}` : '任务: 爬取热门内容'}
URL: ${url}

要求:
1. 访问网站并等待页面完全加载
2. 自动识别内容列表（热榜、搜索结果等）
3. 提取每条内容的信息:
   - title: 标题
   - summary: 摘要（200-500字）
   - fullContent: 完整正文（可选，如能获取则提供）
   - author: 作者
   - url: 完整链接（必须包含 https://）
   - likes: 点赞数
   - comments: 评论数
4. 最多提取 30 条
5. 返回纯 JSON 数组，不要任何解释

JSON 格式:
[
  {
    "title": "标题",
    "summary": "摘要内容（200-500字）",
    "fullContent": "完整正文（可选）",
    "author": "作者",
    "url": "https://...",
    "likes": 1000,
    "comments": 50
  }
]
`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(result: any): any[] {
    try {
      let text = '';

      // 提取文本
      if (result.content && Array.isArray(result.content)) {
        text = result.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n');
      } else if (typeof result === 'string') {
        text = result;
      }

      // 提取 JSON
      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) {
        this.logger.warn('未找到 JSON 数组');
        return [];
      }

      const articles = JSON.parse(jsonMatch[0]);

      // 标准化
      return articles.map((item) => ({
        title: item.title || '',
        summary: item.summary || item.content || item.title || '', // 向后兼容
        fullContent: item.fullContent || '', // 完整正文
        author: item.author || '未知',
        url: item.url || '',
        publishTime: new Date(),
        likes: parseInt(item.likes) || 0,
        comments: parseInt(item.comments) || 0,
        tags: [],
        platform: '',
        crawledAt: new Date(),
      }));
    } catch (error) {
      this.logger.error('解析失败:', error.message);
      return [];
    }
  }

  /**
   * 生成 AI 策略建议
   */
  async generateAIStrategy(
    timeframe: number,
    platforms: string[],
    objectives: string[],
  ): Promise<AIStrategySuggestion> {
    if (!this.mcpService.isReady()) {
      // 返回默认策略
      return this.getDefaultStrategy(timeframe, platforms, objectives);
    }

    try {
      this.logger.log(`🤖 生成 AI 策略: ${timeframe}天, 平台: ${platforms.join(',')}`);

      const prompt = `
你是智能内容策略专家。根据以下信息生成最优的内容爬取策略:

时间范围: ${timeframe} 天
目标平台: ${platforms.join(', ')}
目标: ${objectives.join(', ')}

请分析并生成策略，包括:
1. 各平台权重和理由
2. 推荐关键词（优先级、分类、趋势）
3. 执行计划（频率、最佳时间）
4. 预期效果
5. 具体建议

返回 JSON 格式，不要任何解释。
`;

      const result = await this.mcpService.callTool('ask_claude', {
        prompt,
        model: 'claude-sonnet-4-5',
      });

      const strategy = this.parseStrategyResponse(result);
      this.logger.log('✅ AI 策略生成完成');

      return strategy || this.getDefaultStrategy(timeframe, platforms, objectives);
    } catch (error) {
      this.logger.error(`❌ AI 策略生成失败: ${error.message}`);
      return this.getDefaultStrategy(timeframe, platforms, objectives);
    }
  }

  /**
   * 解析策略响应
   */
  private parseStrategyResponse(result: any): AIStrategySuggestion | null {
    try {
      let text = '';

      if (result.content && Array.isArray(result.content)) {
        text = result.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n');
      } else if (typeof result === 'string') {
        text = result;
      }

      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return null;
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      this.logger.error('策略解析失败:', error.message);
      return null;
    }
  }

  /**
   * 获取默认策略
   */
  private getDefaultStrategy(
    timeframe: number,
    platforms: string[],
    objectives: string[],
  ): AIStrategySuggestion {
    return {
      timeframe,
      platforms: platforms.map((name) => ({
        name,
        weight: 1 / platforms.length,
        reasoning: '均匀分配权重以全面覆盖',
      })),
      keywords: [
        {
          keyword: 'AI',
          priority: 1,
          category: 'technology',
          trend: '上升',
        },
        {
          keyword: '科技',
          priority: 2,
          category: 'technology',
          trend: '稳定',
        },
      ],
      schedule: {
        frequency: 'daily',
        optimalTimes: ['09:00', '15:00', '21:00'],
        reasoning: '基于用户活跃度分析',
      },
      objectives: {
        trending: objectives.includes('trending'),
        quality: objectives.includes('quality'),
        engagement: objectives.includes('engagement'),
      },
      expectedResults: {
        articlesPerDay: 30,
        qualityScore: 75,
        engagementRate: 0.15,
      },
      recommendations: [
        '定期分析热点话题',
        '保持内容多样性',
        '关注用户反馈',
      ],
    };
  }
}
