import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClaudeShellQueueService } from './claude-shell-queue.service';

export interface MCPAnalysisResult {
  relevance: number; // 0-1
  quality: number; // 0-1
  shouldCrawl: boolean;
  reasoning: string;
  suggestedActions: string[];
}

export interface MCPContentClassification {
  category: string;
  subcategories: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  tags: string[];
  qualityScore: number;
  potentialViralityScore: number;
}

export interface MCPStrategyRecommendation {
  keywords: string[];
  platforms: string[];
  timing: string;
  reasoning: string;
  expectedPerformance: number;
}

/**
 * Claude MCP Service - 使用队列管理 Shell 调用
 * - 最多 5 个并发实例
 * - FIFO 任务队列
 * - 超时和死锁检测
 */
@Injectable()
export class ClaudeMCPService implements OnModuleInit {
  private readonly logger = new Logger(ClaudeMCPService.name);

  constructor(private queueService: ClaudeShellQueueService) {}

  async onModuleInit() {
    // 队列服务会自动初始化
    this.logger.log('✅ Claude MCP 服务已就绪（队列模式）');
  }

  /**
   * 检查连接状态
   */
  isReady(): boolean {
    return this.queueService.isReady();
  }

  /**
   * 检查浏览器 MCP 是否可用（爬虫功能需要）
   */
  hasBrowserCapability(): boolean {
    return this.queueService.hasBrowserCapability();
  }

  /**
   * 获取可用的 MCP 工具列表
   */
  getAvailableMCPTools(): string[] {
    return this.queueService.getAvailableMCPTools();
  }

  /**
   * 启动 Chrome（开启远程调试）
   */
  async startChrome(): Promise<boolean> {
    return this.queueService.startChrome();
  }

  /**
   * 关闭 Chrome
   */
  async stopChrome(): Promise<void> {
    return this.queueService.stopChrome();
  }

  /**
   * 检查 Chrome 是否运行中
   */
  isChromeRunning(): boolean {
    return this.queueService.isChromeRunning();
  }

  /**
   * 执行 Claude 命令（通用方法）
   * @param prompt 提示词
   * @returns Claude 的响应文本
   */
  async execute(prompt: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      const result = await this.queueService.submitTask(prompt);
      return result;
    } catch (error) {
      this.logger.error('Claude execution failed:', error.message);
      throw error;
    }
  }

  /**
   * 使用 Claude 分析是否应该爬取某个内容
   */
  async analyzeContentRelevance(
    title: string,
    excerpt: string,
    metadata: any,
    strategy: any,
  ): Promise<MCPAnalysisResult> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      const prompt = `
你是一个智能内容筛选助手。根据以下信息，判断这个内容是否值得爬取。

内容标题：${title}
内容摘要：${excerpt}
元数据：${JSON.stringify(metadata, null, 2)}

当前策略：
- 目标关键词：${strategy.keywords?.join(', ') || '无'}
- 排除关键词：${strategy.negativeKeywords?.join(', ') || '无'}
- 质量阈值：${strategy.qualityThreshold || 50}
- 内容类型：${strategy.contentType || '综合'}

请分析：
1. 相关性评分 (0-1)：内容与目标关键词的匹配度
2. 质量评分 (0-1)：内容的专业性、深度和价值
3. 是否应该爬取：综合判断
4. 推理过程：简要说明理由
5. 建议的后续操作

返回 JSON 格式：
{
  "relevance": 0.85,
  "quality": 0.75,
  "shouldCrawl": true,
  "reasoning": "分析理由",
  "suggestedActions": ["action1", "action2"]
}
`;

      const response = await this.queueService.submitTask(prompt);
      return this.parseJSON(response, {
        relevance: 0.5,
        quality: 0.5,
        shouldCrawl: false,
        reasoning: '解析失败',
        suggestedActions: [],
      });
    } catch (error) {
      this.logger.error('内容相关性分析失败:', error);
      return {
        relevance: 0.5,
        quality: 0.5,
        shouldCrawl: false,
        reasoning: '分析失败: ' + error.message,
        suggestedActions: [],
      };
    }
  }

  /**
   * 使用 Claude 对内容进行智能分类
   */
  async classifyContent(content: {
    title: string;
    content: string;
    author?: string;
    tags?: string[];
  }): Promise<MCPContentClassification> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      const prompt = `
你是一个专业的内容分类专家。请对以下内容进行深度分类和分析。

标题：${content.title}
内容：${content.content.substring(0, 1000)}
作者：${content.author || '未知'}
原始标签：${content.tags?.join(', ') || '无'}

请提供：
1. 主要类别（科技/财经/生活/教育/娱乐等）
2. 细分子类别
3. 情感倾向（positive/neutral/negative）
4. 优化后的标签（5-10个）
5. 内容质量评分 (0-100)
6. 潜在爆款指数 (0-100)

返回 JSON 格式：
{
  "category": "科技",
  "subcategories": ["人工智能", "机器学习"],
  "sentiment": "positive",
  "tags": ["AI", "技术创新", "深度学习"],
  "qualityScore": 85,
  "potentialViralityScore": 75
}
`;

      const response = await this.queueService.submitTask(prompt);
      return this.parseJSON(response, {
        category: '未分类',
        subcategories: [],
        sentiment: 'neutral',
        tags: content.tags || [],
        qualityScore: 50,
        potentialViralityScore: 50,
      });
    } catch (error) {
      this.logger.error('内容分类失败:', error);
      return {
        category: '未分类',
        subcategories: [],
        sentiment: 'neutral',
        tags: content.tags || [],
        qualityScore: 50,
        potentialViralityScore: 50,
      };
    }
  }

  /**
   * 使用 Claude 生成智能爬取策略
   */
  async generateCrawlStrategy(
    historicalData: any[],
    performanceMetrics: any,
    objectives: string[],
  ): Promise<MCPStrategyRecommendation> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      const prompt = `
你是一个智能运营策略专家。基于历史数据和性能指标，生成下一轮的爬取策略。

历史数据摘要：
${JSON.stringify(historicalData.slice(0, 10), null, 2)}

性能指标：
${JSON.stringify(performanceMetrics, null, 2)}

目标：${objectives.join(', ')}

请分析：
1. 表现最好的关键词（5-10个）
2. 推荐的平台优先级
3. 最佳爬取时机
4. 策略推理过程
5. 预期表现评分 (0-100)

返回 JSON 格式：
{
  "keywords": ["关键词1", "关键词2"],
  "platforms": ["zhihu", "wechat"],
  "timing": "每天 8:00-10:00, 20:00-22:00",
  "reasoning": "推理过程",
  "expectedPerformance": 85
}
`;

      const response = await this.queueService.submitTask(prompt);
      return this.parseJSON(response, {
        keywords: ['AI', '科技'],
        platforms: ['zhihu'],
        timing: '每日一次',
        reasoning: '默认策略',
        expectedPerformance: 50,
      });
    } catch (error) {
      this.logger.error('策略生成失败:', error);
      return {
        keywords: ['AI', '科技'],
        platforms: ['zhihu'],
        timing: '每日一次',
        reasoning: '策略生成失败: ' + error.message,
        expectedPerformance: 50,
      };
    }
  }

  /**
   * 使用 Claude 优化已爬取的内容
   */
  async optimizeContent(
    rawContent: string,
    targetPlatform: string,
    style: string,
  ): Promise<{ title: string; content: string; tags: string[] }> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      const prompt = `
你是一个专业的内容优化专家。请将以下原始内容优化为适合 ${targetPlatform} 平台的风格。

原始内容：
${rawContent.substring(0, 2000)}

目标风格：${style}

请提供：
1. 优化后的标题（吸引眼球）
2. 优化后的正文（保留核心信息，调整表达方式）
3. 推荐标签（5-8个）

返回 JSON 格式：
{
  "title": "优化后标题",
  "content": "优化后内容",
  "tags": ["标签1", "标签2"]
}
`;

      const response = await this.queueService.submitTask(prompt);
      return this.parseJSON(response, {
        title: rawContent.substring(0, 50),
        content: rawContent,
        tags: [],
      });
    } catch (error) {
      this.logger.error('内容优化失败:', error);
      return {
        title: rawContent.substring(0, 50),
        content: rawContent,
        tags: [],
      };
    }
  }

  /**
   * 调用工具（通用方法）- 兼容原有接口
   */
  async callTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
    if (!this.isReady()) {
      throw new Error('Claude 服务未连接');
    }

    try {
      this.logger.debug(`调用 Claude: ${toolName}`, args);

      // 对于 ask_claude 工具，提交到队列
      if (toolName === 'ask_claude') {
        const response = await this.queueService.submitTask(
          args.prompt || args.question || '',
        );
        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      // 其他工具暂不支持
      throw new Error(`不支持的工具: ${toolName}`);
    } catch (error) {
      this.logger.error(`调用 Claude 失败 (${toolName}):`, error);
      throw error;
    }
  }

  /**
   * 列出所有可用的工具（兼容接口）
   */
  async listTools(): Promise<any[]> {
    if (!this.isReady()) {
      return [];
    }

    return [
      {
        name: 'ask_claude',
        description: '调用 Claude 进行智能分析（队列模式）',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: '提示词',
            },
          },
          required: ['prompt'],
        },
      },
    ];
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return this.queueService.getQueueStatus();
  }

  /**
   * 解析 JSON 响应
   */
  private parseJSON<T>(response: string, fallback: T): T {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return fallback;
    } catch (error) {
      this.logger.warn('JSON 解析失败，使用默认值:', error);
      return fallback;
    }
  }

  /**
   * 断开连接（兼容接口）
   */
  async disconnect(): Promise<void> {
    this.logger.log('已断开 Claude 连接');
  }
}
