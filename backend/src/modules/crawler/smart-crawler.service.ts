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
 * 反爬虫配置
 */
interface AntiCrawlerConfig {
  // 随机延迟范围（毫秒）
  minDelay: number;
  maxDelay: number;
  // 是否模拟鼠标移动
  simulateMouseMove: boolean;
  // 是否随机滚动
  randomScroll: boolean;
  // 请求间隔（毫秒）
  requestInterval: number;
  // 最大连续请求数（超过后强制休息）
  maxContinuousRequests: number;
  // 强制休息时间（毫秒）
  forcedBreakTime: number;
}

/**
 * 常用 User-Agent 列表
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

/**
 * 智能爬虫服务 - 纯 MCP 实现
 * 让 Claude 自己决定如何爬取，无需预定义选择器
 * 内置反爬虫规避策略
 */
@Injectable()
export class SmartCrawlerService {
  private readonly logger = new Logger(SmartCrawlerService.name);

  // 请求计数器（用于限流）
  private requestCount = 0;
  private lastRequestTime = 0;

  // 平台特定的反爬虫配置
  private readonly platformConfigs: Record<string, AntiCrawlerConfig> = {
    zhihu: {
      minDelay: 2000,
      maxDelay: 5000,
      simulateMouseMove: true,
      randomScroll: true,
      requestInterval: 3000,
      maxContinuousRequests: 5,
      forcedBreakTime: 30000, // 30秒
    },
    weibo: {
      minDelay: 1500,
      maxDelay: 4000,
      simulateMouseMove: true,
      randomScroll: true,
      requestInterval: 2500,
      maxContinuousRequests: 8,
      forcedBreakTime: 20000,
    },
    wechat: {
      minDelay: 2000,
      maxDelay: 6000,
      simulateMouseMove: false,
      randomScroll: true,
      requestInterval: 4000,
      maxContinuousRequests: 3,
      forcedBreakTime: 60000, // 1分钟
    },
    default: {
      minDelay: 1000,
      maxDelay: 3000,
      simulateMouseMove: false,
      randomScroll: true,
      requestInterval: 2000,
      maxContinuousRequests: 10,
      forcedBreakTime: 15000,
    },
  };

  constructor(private mcpService: ClaudeMCPService) {}

  /**
   * 智能爬取 - 让 Claude 自己想办法
   */
  async crawl(platform: string, keyword?: string): Promise<SmartCrawlResult> {
    // 检查 MCP 服务状态
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

    // 检查浏览器 MCP 是否可用
    if (!this.mcpService.hasBrowserCapability()) {
      const errorMsg = `爬虫功能需要浏览器 MCP 支持。请先配置 Chrome DevTools MCP。

配置方法：
claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest

当前可用 MCP 工具: ${this.mcpService.getAvailableMCPTools().join(', ') || '无'}`;

      this.logger.error(`❌ ${errorMsg}`);

      return {
        success: false,
        platform,
        keyword,
        articles: [],
        totalCrawled: 0,
        errors: [errorMsg],
      };
    }

    // 确保 Chrome 已启动
    if (!this.mcpService.isChromeRunning()) {
      this.logger.log('🚀 自动启动 Chrome...');
      const started = await this.mcpService.startChrome();
      if (!started) {
        return {
          success: false,
          platform,
          keyword,
          articles: [],
          totalCrawled: 0,
          errors: ['Chrome 启动失败，请检查是否安装了 Chrome 浏览器'],
        };
      }
    }

    // 获取平台配置
    const config = this.platformConfigs[platform] || this.platformConfigs.default;

    // 反爬虫：检查是否需要强制休息
    await this.enforceRateLimiting(config);

    try {
      this.logger.log(`🤖 智能爬取: ${platform} ${keyword || '热门内容'}`);

      const url = this.getPlatformUrl(platform, keyword);
      const userAgent = this.getRandomUserAgent();
      const prompt = this.buildAntiCrawlerPrompt(platform, url, keyword, config, userAgent);

      // 调用 MCP ask_claude 工具
      const result = await this.mcpService.callTool('ask_claude', {
        prompt,
        model: 'claude-sonnet-4-5',
      });

      // 更新请求计数
      this.requestCount++;
      this.lastRequestTime = Date.now();

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
   * 强制限流（防止请求过于频繁）
   */
  private async enforceRateLimiting(config: AntiCrawlerConfig): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // 检查是否需要强制休息
    if (this.requestCount >= config.maxContinuousRequests) {
      this.logger.log(`⏸️  达到连续请求上限 (${config.maxContinuousRequests})，休息 ${config.forcedBreakTime / 1000} 秒...`);
      await this.sleep(config.forcedBreakTime);
      this.requestCount = 0;
      return;
    }

    // 确保请求间隔
    if (timeSinceLastRequest < config.requestInterval && this.lastRequestTime > 0) {
      const waitTime = config.requestInterval - timeSinceLastRequest;
      this.logger.debug(`⏳ 等待 ${waitTime}ms 以满足请求间隔...`);
      await this.sleep(waitTime);
    }

    // 添加随机延迟
    const randomDelay = this.getRandomDelay(config.minDelay, config.maxDelay);
    this.logger.debug(`⏳ 随机延迟 ${randomDelay}ms...`);
    await this.sleep(randomDelay);
  }

  /**
   * 获取随机 User-Agent
   */
  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * 获取随机延迟
   */
  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * 构建爬取提示词（包含反爬虫策略）
   */
  private buildAntiCrawlerPrompt(
    platform: string,
    url: string,
    keyword: string | undefined,
    config: AntiCrawlerConfig,
    userAgent: string,
  ): string {
    // 生成随机的人类行为参数
    const scrollCount = Math.floor(Math.random() * 3) + 2; // 2-4次滚动
    const readingTime = Math.floor(Math.random() * 3000) + 2000; // 2-5秒阅读时间
    const mouseMovements = Math.floor(Math.random() * 5) + 3; // 3-7次鼠标移动

    return `
你是一个智能爬虫助手，需要模拟真实用户行为来访问网站并提取内容。

⚠️ 重要：必须严格按照以下步骤模拟人类用户操作，避免触发反爬虫检测！

## 平台信息
- 平台: ${platform}
- URL: ${url}
${keyword ? `- 搜索关键词: ${keyword}` : '- 任务: 爬取热门内容'}

## 第一步：设置浏览器环境
1. 设置 User-Agent: ${userAgent}
2. 设置合理的视窗大小（1920x1080 或 1440x900）
3. 设置中文语言偏好：Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
4. 禁用 webdriver 标识（如果可能）

## 第二步：模拟人类访问行为
1. 首先访问网站首页，等待 ${readingTime}ms
2. ${config.simulateMouseMove ? `随机移动鼠标 ${mouseMovements} 次，模拟用户浏览` : '等待页面完全加载'}
3. ${config.randomScroll ? `缓慢向下滚动 ${scrollCount} 次，每次滚动后停顿 1-2 秒` : '等待内容加载'}
4. 如果有登录弹窗或广告，尝试关闭它们
5. ${keyword ? '找到搜索框，像人类一样逐字输入关键词（每个字间隔 100-300ms），然后点击搜索' : '直接浏览热门内容列表'}

## 第三步：智能识别页面结构
针对 ${platform} 平台：
${this.getPlatformSpecificInstructions(platform)}

## 第四步：提取内容
从页面中提取以下信息（最多 20 条，避免过度爬取）：
- title: 标题
- summary: 摘要（200-500字，如果页面没有摘要，从正文截取）
- fullContent: 完整正文（如能获取）
- author: 作者名
- url: 完整链接（必须是 https:// 开头的完整 URL）
- likes: 点赞/赞同数
- comments: 评论数
- publishTime: 发布时间（如有）

## 第五步：处理异常情况
- 如果遇到验证码，停止爬取并返回空数组
- 如果遇到登录墙，尝试获取可见内容
- 如果页面加载失败，等待 3 秒后重试一次
- 如果被重定向到其他页面，检查是否是反爬虫措施

## 输出要求
只返回 JSON 数组，不要任何解释文字：
[
  {
    "title": "标题",
    "summary": "摘要内容",
    "fullContent": "完整正文（可选）",
    "author": "作者",
    "url": "https://...",
    "likes": 1000,
    "comments": 50,
    "publishTime": "2024-01-01"
  }
]

如果遇到反爬虫阻止，返回：
{ "blocked": true, "reason": "具体原因" }
`;
  }

  /**
   * 获取平台特定的爬取指令
   */
  private getPlatformSpecificInstructions(platform: string): string {
    const instructions: Record<string, string> = {
      zhihu: `
- 知乎热榜页面：查找 class 包含 "HotList" 或 "HotItem" 的元素
- 知乎搜索结果：查找 class 包含 "SearchResult" 或 "ContentItem" 的元素
- 注意：知乎会检测滚动速度，请缓慢滚动
- 注意：如果出现"安全验证"页面，说明被检测到，应停止
- 点击内容进入详情页时，要等待 2-3 秒再返回
- 知乎的赞同数在 "VoteButton" 类中，评论数在 "ContentItem-actions" 中`,

      weibo: `
- 微博热搜：查找 "#pl_top_realtimehot" 或类似热搜列表容器
- 微博搜索：查找 "card-wrap" 或 "WB_cardwrap" 类的元素
- 注意：微博有复杂的登录检测，尽量获取不登录可见的内容
- 微博的点赞数和评论数通常在卡片底部的操作栏中`,

      wechat: `
- 微信搜狗搜索：查找 "news-box" 或 "txt-box" 类的元素
- 注意：微信公众号内容需要点击进入才能获取全文
- 微信文章的阅读数通常不直接显示
- 优先获取文章标题、来源公众号、发布时间`,

      default: `
- 尝试识别常见的列表容器：ul/ol、class 包含 list/item/card 的元素
- 查找文章标题：h1/h2/h3 或 class 包含 title 的元素
- 查找作者信息：class 包含 author/user/name 的元素
- 查找互动数据：class 包含 like/comment/view 的元素`,
    };

    return instructions[platform] || instructions.default;
  }

  /**
   * 旧方法保留兼容（已废弃）
   * @deprecated 使用 buildAntiCrawlerPrompt 代替
   */
  private buildPrompt(platform: string, url: string, keyword?: string): string {
    const config = this.platformConfigs[platform] || this.platformConfigs.default;
    const userAgent = this.getRandomUserAgent();
    return this.buildAntiCrawlerPrompt(platform, url, keyword, config, userAgent);
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

      // 检查是否被阻止
      const blockedMatch = text.match(/\{\s*"blocked"\s*:\s*true/);
      if (blockedMatch) {
        const blockedJson = text.match(/\{[^{}]*"blocked"[^{}]*\}/);
        if (blockedJson) {
          const blocked = JSON.parse(blockedJson[0]);
          this.logger.warn(`🚫 爬取被阻止: ${blocked.reason || '未知原因'}`);
        }
        return [];
      }

      // 提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn('未找到 JSON 数组');
        return [];
      }

      const articles = JSON.parse(jsonMatch[0]);

      // 标准化并过滤无效数据
      return articles
        .filter((item) => item.title && item.title.trim()) // 必须有标题
        .map((item) => ({
          title: item.title?.trim() || '',
          summary: item.summary || item.content || item.title || '',
          fullContent: item.fullContent || '',
          author: item.author || '未知',
          url: item.url || '',
          publishTime: item.publishTime ? new Date(item.publishTime) : new Date(),
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
