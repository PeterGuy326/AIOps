import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SiteLogin, SiteLoginDocument } from '../database/schemas/site-login.schema';
import { BrowserSessionService, PLATFORM_CONFIGS } from './browser-session.service';
import { ClaudeShellQueueService } from '../ai/claude-shell-queue.service';

/**
 * 登录检测结果
 */
export interface LoginCheckResult {
  platform: string;
  isLoggedIn: boolean;
  username?: string;
  avatarUrl?: string;
  error?: string;
}

/**
 * 登录状态检测服务
 * 使用 Claude MCP 检测各平台的登录状态
 */
@Injectable()
export class LoginCheckService {
  private readonly logger = new Logger(LoginCheckService.name);

  // 检测间隔（毫秒）
  private readonly CHECK_INTERVAL = 30 * 60 * 1000; // 30分钟
  private checkTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(SiteLogin.name) private siteLoginModel: Model<SiteLoginDocument>,
    private browserSessionService: BrowserSessionService,
    private claudeQueueService: ClaudeShellQueueService,
  ) {}

  /**
   * 启动定时检测
   */
  startPeriodicCheck() {
    this.logger.log('🔄 启动登录状态定时检测');
    this.checkTimer = setInterval(() => {
      this.checkAllPlatforms().catch(err => {
        this.logger.error('定时检测失败:', err.message);
      });
    }, this.CHECK_INTERVAL);
  }

  /**
   * 停止定时检测
   */
  stopPeriodicCheck() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
  }

  /**
   * 检测所有启用的平台登录状态
   */
  async checkAllPlatforms(): Promise<LoginCheckResult[]> {
    const platforms = await this.siteLoginModel.find({ enabled: true });
    const results: LoginCheckResult[] = [];

    for (const platform of platforms) {
      try {
        const result = await this.checkPlatformLogin(platform.platform);
        results.push(result);
      } catch (error) {
        results.push({
          platform: platform.platform,
          isLoggedIn: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 检测指定平台的登录状态
   */
  async checkPlatformLogin(platform: string): Promise<LoginCheckResult> {
    this.logger.log(`🔍 检测登录状态: ${platform}`);

    const siteLogin = await this.siteLoginModel.findOne({ platform });
    if (!siteLogin) {
      throw new Error(`平台 ${platform} 未配置`);
    }

    // 更新状态为检测中
    await this.siteLoginModel.updateOne(
      { platform },
      { $set: { status: 'checking', lastCheckTime: new Date() } },
    );

    try {
      // 构建检测 prompt
      const prompt = this.buildCheckLoginPrompt(platform, siteLogin.checkConfig);

      // 调用 Claude 执行检测
      const result = await this.claudeQueueService.submitTask(prompt, false);

      // 解析结果
      const checkResult = this.parseCheckResult(platform, result);

      // 更新数据库
      await this.updateLoginStatus(platform, checkResult);

      return checkResult;
    } catch (error) {
      // 更新错误状态
      await this.siteLoginModel.updateOne(
        { platform },
        {
          $set: {
            status: 'logged_out',
            lastError: error.message,
            lastCheckTime: new Date(),
          },
        },
      );

      return {
        platform,
        isLoggedIn: false,
        error: error.message,
      };
    }
  }

  /**
   * 构建登录检测 prompt
   */
  private buildCheckLoginPrompt(platform: string, checkConfig: any): string {
    const config = PLATFORM_CONFIGS[platform];
    const platformName = config?.name || platform;

    return `
你是一个登录状态检测助手。请执行以下操作：

1. 使用 Chrome MCP 工具打开页面：${checkConfig.checkUrl}
2. 等待页面加载完成（最多等待 10 秒）
3. 检测登录状态：
   ${checkConfig.loggedInSelector ? `- 如果能找到选择器 "${checkConfig.loggedInSelector}"，表示已登录` : ''}
   ${checkConfig.loggedOutSelector ? `- 如果能找到选择器 "${checkConfig.loggedOutSelector}"，表示未登录` : ''}
4. 如果已登录：
   ${checkConfig.usernameSelector ? `- 尝试获取用户名（选择器: "${checkConfig.usernameSelector}"）` : '- 尝试获取用户名'}
   ${checkConfig.avatarSelector ? `- 尝试获取头像 URL（选择器: "${checkConfig.avatarSelector}"）` : ''}

请以 JSON 格式返回结果：
\`\`\`json
{
  "platform": "${platform}",
  "isLoggedIn": true/false,
  "username": "用户名（如果能获取）",
  "avatarUrl": "头像URL（如果能获取）",
  "error": "错误信息（如果有）"
}
\`\`\`

重要提示：
- 只返回 JSON，不要添加其他说明
- 如果遇到错误，在 error 字段中说明
- 平台名称：${platformName}
`;
  }

  /**
   * 解析检测结果
   */
  private parseCheckResult(platform: string, result: string): LoginCheckResult {
    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(result);
      return {
        platform,
        isLoggedIn: parsed.isLoggedIn === true,
        username: parsed.username,
        avatarUrl: parsed.avatarUrl,
        error: parsed.error,
      };
    } catch {
      // 解析失败，尝试从文本中提取
      const isLoggedIn = result.toLowerCase().includes('logged') &&
                         result.toLowerCase().includes('true');
      return {
        platform,
        isLoggedIn,
        error: '结果解析失败',
      };
    }
  }

  /**
   * 更新登录状态
   */
  private async updateLoginStatus(platform: string, result: LoginCheckResult) {
    const updateData: any = {
      status: result.isLoggedIn ? 'logged_in' : 'logged_out',
      lastCheckTime: new Date(),
      lastError: result.error,
    };

    if (result.isLoggedIn) {
      if (result.username) updateData.username = result.username;
      if (result.avatarUrl) updateData.avatarUrl = result.avatarUrl;
      updateData.lastLoginTime = new Date();
    }

    await this.siteLoginModel.updateOne({ platform }, { $set: updateData });
  }

  /**
   * 获取所有平台的登录状态
   */
  async getAllLoginStatus(): Promise<SiteLoginDocument[]> {
    return this.siteLoginModel.find({ enabled: true }).sort({ platformName: 1 });
  }

  /**
   * 获取指定平台的登录状态
   */
  async getLoginStatus(platform: string): Promise<SiteLoginDocument | null> {
    return this.siteLoginModel.findOne({ platform });
  }

  /**
   * 手动标记为已登录
   */
  async markAsLoggedIn(platform: string, username?: string): Promise<void> {
    await this.siteLoginModel.updateOne(
      { platform },
      {
        $set: {
          status: 'logged_in',
          username,
          lastLoginTime: new Date(),
          lastCheckTime: new Date(),
          lastError: undefined,
        },
      },
    );
  }

  /**
   * 手动标记为未登录
   */
  async markAsLoggedOut(platform: string): Promise<void> {
    await this.siteLoginModel.updateOne(
      { platform },
      {
        $set: {
          status: 'logged_out',
          lastCheckTime: new Date(),
        },
      },
    );
  }

  /**
   * 添加自定义平台
   */
  async addCustomPlatform(config: {
    platform: string;
    platformName: string;
    checkUrl: string;
    loginUrl?: string;
    loggedInSelector?: string;
    loggedOutSelector?: string;
  }): Promise<SiteLoginDocument> {
    const userDataDir = `/tmp/chrome-aiops-sessions/${config.platform}`;

    return this.siteLoginModel.create({
      platform: config.platform,
      platformName: config.platformName,
      status: 'logged_out',
      userDataDir,
      checkConfig: {
        checkUrl: config.checkUrl,
        loginUrl: config.loginUrl || config.checkUrl,
        loggedInSelector: config.loggedInSelector,
        loggedOutSelector: config.loggedOutSelector,
      },
      enabled: true,
    });
  }

  /**
   * 删除平台配置
   */
  async removePlatform(platform: string): Promise<void> {
    await this.siteLoginModel.deleteOne({ platform });
  }

  /**
   * 更新平台配置
   */
  async updatePlatformConfig(
    platform: string,
    config: Partial<{
      platformName: string;
      enabled: boolean;
      checkConfig: any;
      remark: string;
    }>,
  ): Promise<void> {
    await this.siteLoginModel.updateOne({ platform }, { $set: config });
  }
}
