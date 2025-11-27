import { Controller, Post, Body, Get } from '@nestjs/common';
import { AIService } from './ai.service';
import { SmartCrawlerService } from '../crawler/smart-crawler.service';
import { ClaudeMCPService } from './claude-mcp.service';

/**
 * AI 控制器 - 三段式 RESTful API
 * 格式: /ai/{action}/{method}
 */
@Controller('ai')
export class AIController {
  constructor(
    private aiService: AIService,
    private smartCrawlerService: SmartCrawlerService,
    private mcpService: ClaudeMCPService,
  ) {}

  /**
   * POST /ai/content/generate
   * 生成内容
   */
  @Post('content/generate')
  async generateContent(@Body() data: { rawData: any[]; strategy: any }) {
    const contents = await this.aiService.generateContent(
      data.rawData,
      data.strategy,
    );
    return {
      message: '内容生成成功',
      contents,
      count: contents.length,
    };
  }

  /**
   * POST /ai/content/analyze
   * 分析内容
   */
  @Post('content/analyze')
  async analyzeContent(@Body() data: { content: string }) {
    const analysis = await this.aiService.analyzeContent(data.content);
    return {
      message: '内容分析成功',
      analysis,
    };
  }

  /**
   * POST /ai/strategy/generate
   * 生成策略
   */
  @Post('strategy/generate')
  async generateStrategy(
    @Body()
    data: {
      timeframe?: number;
      platforms?: string[];
      objectives?: string[];
    },
  ) {
    const {
      timeframe = 7,
      platforms = ['zhihu', 'wechat', 'news'],
      objectives = ['trending', 'quality', 'engagement'],
    } = data;

    const strategy = await this.smartCrawlerService.generateAIStrategy(
      timeframe,
      platforms,
      objectives,
    );

    return {
      message: 'AI策略生成成功',
      strategy,
    };
  }

  /**
   * POST /ai/strategy/optimize
   * 优化策略
   */
  @Post('strategy/optimize')
  async optimizeStrategy(
    @Body()
    data: {
      currentStrategy: any;
      performanceData: any;
      objectives: string[];
    },
  ) {
    const { currentStrategy, performanceData, objectives } = data;

    // 模拟AI策略优化逻辑
    const optimizations = {
      keywordAdjustments: {
        added: ['AI应用', '智能技术', '创新趋势'],
        removed: ['过时关键词'],
        weightChanges: {
          AI: { old: 0.3, new: 0.4 },
          科技: { old: 0.2, new: 0.3 },
        },
      },
      platformOptimizations: {
        increased: ['zhihu'],
        decreased: ['news'],
        reasoning: '基于历史数据分析，知乎平台的用户互动率更高',
      },
      scheduleOptimizations: {
        newFrequency: '6hours',
        optimalTimes: ['09:00', '18:00', '21:00'],
        reasoning: '用户活跃度分析显示这些时间段互动效果最佳',
      },
      qualityImprovements: {
        newThreshold: 75,
        qualityFactors: ['原创性', '实用性', '时效性', '互动性'],
        expectedImprovement: '15%',
      },
    };

    return {
      message: '策略优化建议生成成功',
      optimizations,
      expectedImpact: {
        engagement: '+20%',
        reach: '+15%',
        quality: '+25%',
        efficiency: '+30%',
      },
      implementationPlan: [
        {
          step: 1,
          action: '更新关键词列表',
          priority: 'high',
          estimatedTime: '30分钟',
        },
        {
          step: 2,
          action: '调整平台权重',
          priority: 'medium',
          estimatedTime: '15分钟',
        },
        {
          step: 3,
          action: '优化执行时间',
          priority: 'medium',
          estimatedTime: '10分钟',
        },
      ],
    };
  }

  /**
   * POST /ai/keyword/generate
   * 生成关键词
   */
  @Post('keyword/generate')
  async generateKeywords(
    @Body()
    data: {
      baseKeywords?: string[];
      targetCount?: number;
      context?: string;
    },
  ) {
    const { baseKeywords = [], targetCount = 10, context = '内容创作' } = data;

    // 模拟AI生成关键词的逻辑
    const allKeywords = [
      '人工智能',
      'AI',
      '机器学习',
      '深度学习',
      'ChatGPT',
      'GPT-4',
      '科技创新',
      '数字化转型',
      '智能制造',
      '自动驾驶',
      '元宇宙',
      'Web3',
      '区块链',
      '新能源',
      '碳中和',
      '可持续发展',
      '大数据',
      '云计算',
      '物联网',
      '5G技术',
      '量子计算',
    ];

    // 基于基础关键词和上下文生成相关关键词
    let generatedKeywords = allKeywords;

    if (baseKeywords.length > 0) {
      generatedKeywords = [
        ...baseKeywords,
        ...allKeywords.filter((keyword) =>
          baseKeywords.some((base) => keyword.includes(base) || base.includes(keyword)),
        ),
        ...allKeywords.slice(0, targetCount - baseKeywords.length),
      ].slice(0, targetCount);
    } else {
      generatedKeywords = allKeywords.slice(0, targetCount);
    }

    // 为每个关键词添加权重和趋势信息
    const keywordAnalysis = generatedKeywords.map((keyword) => ({
      keyword,
      weight: Math.random() * 100,
      trend: ['上升', '稳定', '下降'][Math.floor(Math.random() * 3)],
      competition: ['低', '中', '高'][Math.floor(Math.random() * 3)],
      suggestion: `建议在${context}场景中使用该关键词`,
      relatedTopics: allKeywords.filter((k) => k !== keyword).slice(0, 3),
    }));

    return {
      message: '关键词生成成功',
      keywords: keywordAnalysis,
      total: keywordAnalysis.length,
    };
  }

  /**
   * POST /ai/trend/predict
   * 预测趋势
   */
  @Post('trend/predict')
  async predictTrends(
    @Body()
    data: {
      timeframe?: number;
      category?: string;
      keywords?: string[];
    },
  ) {
    const { timeframe = 7, category = '科技', keywords = [] } = data;

    // 模拟趋势预测
    const trends = [
      {
        keyword: 'AI应用',
        currentScore: 85,
        predictedScore: 92,
        trend: '上升',
        confidence: 0.87,
        timeframe: `${timeframe}天`,
        reasons: ['政策支持', '技术突破', '市场需求增长'],
        relatedKeywords: ['机器学习', '深度学习', '智能算法'],
      },
      {
        keyword: '数字化转型',
        currentScore: 78,
        predictedScore: 83,
        trend: '上升',
        confidence: 0.82,
        timeframe: `${timeframe}天`,
        reasons: ['企业需求', '成本优化', '效率提升'],
        relatedKeywords: ['云计算', '大数据', '智能制造'],
      },
      {
        keyword: '元宇宙',
        currentScore: 65,
        predictedScore: 58,
        trend: '下降',
        confidence: 0.75,
        timeframe: `${timeframe}天`,
        reasons: ['技术成熟度', '用户接受度', '内容生态'],
        relatedKeywords: ['VR', 'AR', '虚拟现实'],
      },
    ];

    // 如果指定了关键词，过滤并添加预测
    if (keywords.length > 0) {
      const filteredTrends = trends.filter((trend) =>
        keywords.some(
          (keyword) =>
            trend.keyword.includes(keyword) || keyword.includes(trend.keyword),
        ),
      );

      return {
        message: '趋势预测成功',
        trends: filteredTrends.length > 0 ? filteredTrends : trends,
        category,
        timeframe,
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      message: '趋势预测成功',
      trends,
      category,
      timeframe,
      generatedAt: new Date().toISOString(),
      insights: {
        topGrowing: trends.filter((t) => t.trend === '上升').slice(0, 3),
        topDeclining: trends.filter((t) => t.trend === '下降').slice(0, 2),
        averageConfidence:
          trends.reduce((sum, t) => sum + t.confidence, 0) / trends.length,
      },
    };
  }

  /**
   * GET /ai/queue/status
   * 查看队列状态
   */
  @Get('queue/status')
  async getQueueStatus() {
    return {
      message: '队列状态查询成功',
      ...this.mcpService.getQueueStatus(),
    };
  }
}
