import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { SiteLogin, SiteLoginDocument, SHARED_CHROME_USER_DATA_DIR } from '../database/schemas/site-login.schema';
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
  skipped?: boolean; // 是否跳过检测（在有效期内）
  expiresAt?: Date; // 登录过期时间
}

/**
 * 登录状态检测服务
 * 使用 Chrome DevTools Protocol 检测 Cookie 判断登录状态
 * 不依赖 Claude，更快更稳定
 *
 * 核心特性：
 * 1. 所有平台共享一个 Chrome 实例（使用用户真实配置）
 * 2. 登录一次，有效期内无需重复登录
 * 3. 智能检测：只在需要时才检测登录状态
 * 4. Cookie 检测：直接检测登录态 Cookie，比选择器更可靠
 */
@Injectable()
export class LoginCheckService {
  private readonly logger = new Logger(LoginCheckService.name);
  // 使用独立端口 9223，避免与用户日常使用的 Chrome 冲突
  private readonly CHROME_DEBUG_PORT = 9223;

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
   * 智能检测：只检测已过期或未登录的平台
   */
  async checkAllPlatforms(forceCheck: boolean = false): Promise<LoginCheckResult[]> {
    const platforms = await this.siteLoginModel.find({ enabled: true });
    const results: LoginCheckResult[] = [];

    // 所有共享配置的平台使用同一个 Chrome 实例
    // 只需要启动一次 Chrome
    let chromeStarted = false;

    for (const platform of platforms) {
      try {
        const result = await this.checkPlatformLogin(platform.platform, forceCheck, chromeStarted);
        results.push(result);

        // 如果这次检测启动了 Chrome，后续平台复用
        if (!result.skipped) {
          chromeStarted = true;
        }
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
   *
   * 智能检测逻辑：
   * 1. 如果登录在有效期内且 forceCheck=false，跳过检测
   * 2. 优先从 Chrome Cookie 文件直接读取（无需启动 Chrome）
   * 3. 如果 Cookie 文件读取失败，才启动 Chrome 进行检测
   * 4. 检测后更新 expiresAt
   *
   * @param platform 平台标识
   * @param forceCheck 是否强制检测（忽略有效期）
   * @param chromeAlreadyStarted Chrome 是否已启动（避免重复启动）
   */
  async checkPlatformLogin(
    platform: string,
    forceCheck: boolean = false,
    chromeAlreadyStarted: boolean = false,
  ): Promise<LoginCheckResult> {
    const siteLogin = await this.siteLoginModel.findOne({ platform });
    if (!siteLogin) {
      throw new Error(`平台 ${platform} 未配置`);
    }

    // 检查是否在有效期内（如果不是强制检测）
    if (!forceCheck && this.isLoginValid(siteLogin)) {
      this.logger.log(`✅ ${platform} 登录在有效期内，跳过检测 (过期时间: ${siteLogin.expiresAt})`);
      return {
        platform,
        isLoggedIn: true,
        username: siteLogin.username,
        avatarUrl: siteLogin.avatarUrl,
        skipped: true,
        expiresAt: siteLogin.expiresAt,
      };
    }

    this.logger.log(`🔍 检测登录状态: ${platform} (强制: ${forceCheck})`);

    // 更新状态为检测中
    await this.siteLoginModel.updateOne(
      { platform },
      { $set: { status: 'checking', lastCheckTime: new Date() } },
    );

    try {
      // 确定使用的 userDataDir
      const userDataDir = siteLogin.useSharedProfile
        ? SHARED_CHROME_USER_DATA_DIR
        : siteLogin.userDataDir;

      // ========== 优先方法：直接读取 Cookie 文件（无需启动 Chrome） ==========
      const { loginCookies, domain } = siteLogin.checkConfig || {};
      if (loginCookies && loginCookies.length > 0 && domain) {
        this.logger.log(`🍪 尝试从 Cookie 文件直接读取...`);
        try {
          const cookieResult = await this.checkCookieFromFile(platform, userDataDir, domain, loginCookies);
          if (cookieResult.isLoggedIn) {
            // Cookie 检测成功，更新状态
            await this.updateLoginStatus(platform, cookieResult, siteLogin.loginValidityHours);
            return cookieResult;
          }
          this.logger.log(`⚠️ Cookie 文件检测未找到登录态，尝试其他方法...`);
        } catch (cookieError) {
          this.logger.warn(`Cookie 文件读取失败: ${cookieError.message}，尝试 CDP 检测...`);
        }
      }

      // ========== 备用方法：启动 Chrome 使用 CDP 检测 ==========
      if (!chromeAlreadyStarted) {
        this.logger.log(`🔄 启动 Chrome (userDataDir: ${userDataDir})`);
        const chromeStarted = await this.claudeQueueService.startChrome(
          userDataDir,
          false,  // forceRestart=false
          false,  // headless=false
          siteLogin.checkConfig?.checkUrl,
        );
        if (!chromeStarted) {
          throw new Error('Chrome 启动失败');
        }
      } else {
        this.logger.log(`🌐 导航到: ${siteLogin.checkConfig?.checkUrl}`);
        await this.claudeQueueService.navigateToUrl(siteLogin.checkConfig?.checkUrl);
        await this.sleep(1000);
      }

      // 使用 CDP 检测登录状态
      const checkResult = await this.checkWithCDP(platform, siteLogin.checkConfig);

      // 更新数据库
      await this.updateLoginStatus(platform, checkResult, siteLogin.loginValidityHours);

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
   * 直接从 Chrome Cookie 文件读取登录状态
   * 无需启动 Chrome，直接读取 SQLite 数据库
   *
   * macOS: ~/Library/Application Support/Google/Chrome/Default/Cookies
   * Linux: ~/.config/google-chrome/Default/Cookies
   * Windows: %LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies
   */
  private async checkCookieFromFile(
    platform: string,
    userDataDir: string,
    domain: string,
    loginCookies: string[],
  ): Promise<LoginCheckResult> {
    // 确定 Cookie 文件路径
    const cookiePaths = [
      path.join(userDataDir, 'Default', 'Network', 'Cookies'),
      path.join(userDataDir, 'Default', 'Cookies'),
      path.join(userDataDir, 'Profile 1', 'Network', 'Cookies'),
      path.join(userDataDir, 'Profile 1', 'Cookies'),
    ];

    let cookiePath: string | null = null;
    for (const p of cookiePaths) {
      if (fs.existsSync(p)) {
        cookiePath = p;
        break;
      }
    }

    if (!cookiePath) {
      throw new Error('Cookie 文件不存在');
    }

    this.logger.log(`📂 Cookie 文件: ${cookiePath}`);

    // 复制 Cookie 文件到临时位置（避免锁定问题）
    const tmpCookiePath = `/tmp/chrome-cookies-${Date.now()}.db`;
    fs.copyFileSync(cookiePath, tmpCookiePath);

    try {
      // 使用 sqlite3 命令查询 Cookie
      // 查询指定域名的 Cookie
      const query = `SELECT name, value, host_key FROM cookies WHERE host_key LIKE '%${domain}%' OR host_key LIKE '%${domain.replace(/^\./, '')}%'`;

      const result = execSync(`sqlite3 "${tmpCookiePath}" "${query}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      this.logger.log(`🔍 查询域名: ${domain}`);

      // 解析结果
      const foundCookies: string[] = [];
      const lines = result.trim().split('\n').filter(l => l);

      for (const line of lines) {
        const [name] = line.split('|');
        if (loginCookies.includes(name)) {
          foundCookies.push(name);
        }
      }

      const isLoggedIn = foundCookies.length > 0;

      if (isLoggedIn) {
        this.logger.log(`✅ 从 Cookie 文件找到登录态: ${foundCookies.join(', ')}`);
      } else {
        this.logger.log(`⚠️ Cookie 文件中未找到登录 Cookie`);
        this.logger.log(`   查找的 Cookie: ${loginCookies.join(', ')}`);
        this.logger.log(`   数据库中的 Cookie 数量: ${lines.length}`);
      }

      return {
        platform,
        isLoggedIn,
      };
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(tmpCookiePath);
      } catch {}
    }
  }

  /**
   * 检查登录是否仍在有效期内
   */
  private isLoginValid(siteLogin: SiteLoginDocument): boolean {
    // 如果状态不是已登录，需要检测
    if (siteLogin.status !== 'logged_in') {
      return false;
    }

    // 如果没有过期时间，需要检测
    if (!siteLogin.expiresAt) {
      return false;
    }

    // 检查是否过期
    const now = new Date();
    return siteLogin.expiresAt > now;
  }

  /**
   * 计算登录过期时间
   */
  private calculateExpiresAt(loginValidityHours: number): Date {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + loginValidityHours);
    return expiresAt;
  }

  /**
   * 使用 Chrome DevTools Protocol 检测登录状态
   * 仅使用 Cookie 检测
   */
  private async checkWithCDP(platform: string, checkConfig: any): Promise<LoginCheckResult> {
    const {
      checkUrl,
      domain,
      loginCookies,
    } = checkConfig;

    this.logger.log(`📡 CDP 检测: ${checkUrl}`);

    // 获取 Chrome 页面列表（带重试）
    let pages = await this.getChromePages();
    let retries = 0;
    while (pages.length === 0 && retries < 3) {
      this.logger.log(`📄 等待页面创建... (${retries + 1}/3)`);
      await this.sleep(500);
      pages = await this.getChromePages();
      retries++;
    }

    if (pages.length === 0) {
      throw new Error('无法获取 Chrome 页面，请确保 Chrome 已启动');
    }

    // 使用第一个页面
    const page = pages[0];
    this.logger.log(`🔗 连接页面: ${page.url}`);

    const ws = new WebSocket(page.webSocketDebuggerUrl);

    try {
      await this.waitForWebSocketOpen(ws);

      // 检查当前页面是否已经是目标页面
      const currentUrl = page.url || '';
      const needNavigate = !currentUrl.includes(new URL(checkUrl).hostname);

      if (needNavigate) {
        this.logger.log(`🌐 导航到: ${checkUrl}`);
        await this.navigateTo(ws, checkUrl);
        // 等待页面加载
        await this.waitForPageLoad(ws);
      } else {
        this.logger.log(`✅ 已在目标页面: ${currentUrl}`);
        // 短暂等待确保页面完全加载
        await this.sleep(500);
      }

      // Cookie 检测
      let isLoggedIn = false;
      let foundCookies: string[] = [];

      if (loginCookies && loginCookies.length > 0) {
        this.logger.log(`🍪 Cookie 检测: 查找 ${loginCookies.join(', ')}`);

        const cookies = await this.getCookies(ws, domain || new URL(checkUrl).hostname);
        foundCookies = cookies
          .filter((c: any) => loginCookies.includes(c.name))
          .map((c: any) => c.name);

        if (foundCookies.length > 0) {
          isLoggedIn = true;
          this.logger.log(`✅ 找到登录 Cookie: ${foundCookies.join(', ')}`);
        } else {
          this.logger.log(`⚠️ 未找到登录 Cookie`);
        }
      } else {
        this.logger.warn(`⚠️ 平台 ${platform} 未配置 loginCookies，无法检测登录状态`);
      }

      // 最终结果
      this.logger.log(`📋 检测结果: ${platform} - ${isLoggedIn ? '已登录 ✅' : '未登录 ❌'}`);
      if (foundCookies.length > 0) {
        this.logger.log(`   检测方式: Cookie (${foundCookies.join(', ')})`);
      }

      return {
        platform,
        isLoggedIn,
      };
    } finally {
      ws.close();
    }
  }

  /**
   * 通过 CDP 获取指定域名的 Cookie
   */
  private getCookies(ws: WebSocket, domain: string): Promise<any[]> {
    return new Promise((resolve) => {
      const id = Date.now();

      const handler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            ws.off('message', handler);
            const cookies = response.result?.cookies || [];
            // 过滤指定域名的 Cookie
            const filteredCookies = cookies.filter((c: any) =>
              c.domain === domain ||
              c.domain.endsWith(domain) ||
              domain.endsWith(c.domain)
            );
            resolve(filteredCookies);
          }
        } catch (e) {
          // 忽略解析错误
        }
      };

      ws.on('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Network.getAllCookies',
        params: {},
      }));

      setTimeout(() => {
        ws.off('message', handler);
        resolve([]);
      }, 5000);
    });
  }

  /**
   * 获取 Chrome 页面列表
   */
  private getChromePages(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${this.CHROME_DEBUG_PORT}/json`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const pages = JSON.parse(data);
            resolve(pages.filter((p: any) => p.type === 'page'));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * 创建新页面（使用 PUT 方法，Chrome 115+ 要求）
   */
  private createNewPage(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: this.CHROME_DEBUG_PORT,
        path: `/json/new?${encodeURIComponent(url)}`,
        method: 'PUT',
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * 等待 WebSocket 连接打开
   */
  private waitForWebSocketOpen(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket 连接超时')), 10000);
    });
  }

  /**
   * 导航到指定 URL
   */
  private navigateTo(ws: WebSocket, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = Date.now();

      const handler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            ws.off('message', handler);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve();
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      };

      ws.on('message', handler);
      ws.send(JSON.stringify({
        id,
        method: 'Page.navigate',
        params: { url },
      }));

      setTimeout(() => {
        ws.off('message', handler);
        resolve(); // 超时也认为成功（页面可能加载慢）
      }, 10000);
    });
  }

  /**
   * 等待页面加载完成（使用 DOMContentLoaded 事件）
   */
  private waitForPageLoad(ws: WebSocket, timeout: number = 5000): Promise<void> {
    return new Promise((resolve) => {
      const id = Date.now();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          ws.off('message', handler);
          resolve();
        }
      };

      const handler = (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString());
          // 检查 DOM 加载完成
          if (response.id === id && response.result?.result?.value === true) {
            this.logger.log(`✅ 页面加载完成`);
            cleanup();
          }
        } catch (e) {
          // 忽略解析错误
        }
      };

      ws.on('message', handler);

      // 使用轮询检查 document.readyState
      const checkReady = () => {
        if (resolved) return;
        ws.send(JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: {
            expression: `document.readyState === 'complete' || document.readyState === 'interactive'`,
            returnByValue: true,
          },
        }));
      };

      // 立即检查一次
      checkReady();

      // 每 200ms 检查一次
      const interval = setInterval(() => {
        if (resolved) {
          clearInterval(interval);
          return;
        }
        checkReady();
      }, 200);

      // 超时处理
      setTimeout(() => {
        clearInterval(interval);
        cleanup();
      }, timeout);
    });
  }

  /**
   * 更新登录状态
   * @param platform 平台标识
   * @param result 检测结果
   * @param loginValidityHours 登录有效期（小时）
   */
  private async updateLoginStatus(
    platform: string,
    result: LoginCheckResult,
    loginValidityHours: number = 24 * 7,
  ) {
    const updateData: any = {
      status: result.isLoggedIn ? 'logged_in' : 'logged_out',
      lastCheckTime: new Date(),
      lastError: result.error,
    };

    if (result.isLoggedIn) {
      if (result.username) updateData.username = result.username;
      if (result.avatarUrl) updateData.avatarUrl = result.avatarUrl;
      updateData.lastLoginTime = new Date();
      // 设置登录过期时间
      updateData.expiresAt = this.calculateExpiresAt(loginValidityHours);
      this.logger.log(`✅ ${platform} 登录成功，有效期至: ${updateData.expiresAt}`);
    } else {
      // 登录失败，清除过期时间
      updateData.expiresAt = null;
    }

    await this.siteLoginModel.updateOne({ platform }, { $set: updateData });
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== 其他方法保持不变 ====================

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
   * @param platform 平台标识
   * @param username 用户名（可选）
   * @param validityHours 有效期小时数（可选，默认使用平台配置）
   */
  async markAsLoggedIn(platform: string, username?: string, validityHours?: number): Promise<void> {
    // 获取平台配置的有效期
    const siteLogin = await this.siteLoginModel.findOne({ platform });
    const loginValidityHours = validityHours || siteLogin?.loginValidityHours || 24 * 7;

    const expiresAt = this.calculateExpiresAt(loginValidityHours);

    await this.siteLoginModel.updateOne(
      { platform },
      {
        $set: {
          status: 'logged_in',
          username,
          lastLoginTime: new Date(),
          lastCheckTime: new Date(),
          lastError: undefined,
          expiresAt, // 设置过期时间
        },
      },
    );

    this.logger.log(`✅ ${platform} 手动标记为已登录，有效期至: ${expiresAt}`);
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
          expiresAt: null, // 清除过期时间
        },
      },
    );

    this.logger.log(`❌ ${platform} 手动标记为未登录`);
  }

  /**
   * 添加自定义平台
   * 默认使用共享的 Chrome 配置（用户真实配置）
   */
  async addCustomPlatform(config: {
    platform: string;
    platformName: string;
    checkUrl: string;
    loginUrl?: string;
    domain?: string;
    loginCookies?: string[];
    loginValidityHours?: number;
    useSharedProfile?: boolean; // 是否使用共享配置，默认 true
  }): Promise<SiteLoginDocument> {
    // 默认使用共享配置
    const useSharedProfile = config.useSharedProfile !== false;
    const userDataDir = useSharedProfile
      ? SHARED_CHROME_USER_DATA_DIR
      : `/tmp/chrome-aiops-sessions/${config.platform}`;

    return this.siteLoginModel.create({
      platform: config.platform,
      platformName: config.platformName,
      status: 'logged_out',
      userDataDir,
      useSharedProfile,
      loginValidityHours: config.loginValidityHours || 24 * 7,
      checkConfig: {
        checkUrl: config.checkUrl,
        loginUrl: config.loginUrl || config.checkUrl,
        domain: config.domain,
        loginCookies: config.loginCookies || [],
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
