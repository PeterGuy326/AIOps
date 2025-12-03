import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { SiteLogin, SiteLoginDocument, SHARED_CHROME_USER_DATA_DIR } from '../database/schemas/site-login.schema';
import { ClaudeShellQueueService } from '../ai/claude-shell-queue.service';

/**
 * 平台登录检测配置
 * 所有平台默认使用共享的 Chrome 配置（用户真实配置）
 *
 * 登录检测仅使用 Cookie 方式，比 CSS 选择器更可靠
 */
export const PLATFORM_CONFIGS: Record<string, {
  name: string;
  checkUrl: string;
  loginUrl: string;
  domain: string; // Cookie 所属域名
  loginCookies: string[]; // 登录态 Cookie 名称列表（存在任一即为已登录）
  loginValidityHours?: number; // 登录有效期（小时）
}> = {
  zhihu: {
    name: '知乎',
    domain: '.zhihu.com',
    checkUrl: 'https://www.zhihu.com/',
    loginUrl: 'https://www.zhihu.com/signin',
    loginCookies: ['z_c0', 'KLBRSID'],
    loginValidityHours: 24 * 30,
  },
  xiaohongshu: {
    name: '小红书',
    domain: '.xiaohongshu.com',
    checkUrl: 'https://www.xiaohongshu.com/',
    loginUrl: 'https://www.xiaohongshu.com/',
    loginCookies: ['customer-sso-sid', 'customerClientId', 'web_session'],
    loginValidityHours: 24 * 7,
  },
  weixin: {
    name: '微信公众号',
    domain: '.qq.com',
    checkUrl: 'https://mp.weixin.qq.com/',
    loginUrl: 'https://mp.weixin.qq.com/',
    loginCookies: ['slave_sid', 'slave_user', 'bizuin'],
    loginValidityHours: 24,
  },
  weibo: {
    name: '微博',
    domain: '.weibo.com',
    checkUrl: 'https://weibo.com/',
    loginUrl: 'https://weibo.com/login.php',
    loginCookies: ['SUB', 'SUBP', 'login_sid_t'],
    loginValidityHours: 24 * 7,
  },
  bilibili: {
    name: 'B站',
    domain: '.bilibili.com',
    checkUrl: 'https://www.bilibili.com/',
    loginUrl: 'https://passport.bilibili.com/login',
    loginCookies: ['SESSDATA', 'bili_jct', 'DedeUserID'],
    loginValidityHours: 24 * 30,
  },
  douyin: {
    name: '抖音',
    domain: '.douyin.com',
    checkUrl: 'https://www.douyin.com/',
    loginUrl: 'https://www.douyin.com/',
    loginCookies: ['sessionid', 'sessionid_ss', 'passport_csrf_token'],
    loginValidityHours: 24 * 7,
  },
  toutiao: {
    name: '今日头条',
    domain: '.toutiao.com',
    checkUrl: 'https://www.toutiao.com/',
    loginUrl: 'https://www.toutiao.com/',
    loginCookies: ['sso_uid_tt', 'sessionid', 'passport_csrf_token'],
    loginValidityHours: 24 * 7,
  },
  juejin: {
    name: '掘金',
    domain: '.juejin.cn',
    checkUrl: 'https://juejin.cn/',
    loginUrl: 'https://juejin.cn/login',
    loginCookies: ['sessionid', 'sessionid_ss'],
    loginValidityHours: 24 * 30,
  },
};

/**
 * Chrome 会话信息
 */
export interface ChromeSession {
  platform: string;
  port: number;
  process: ChildProcess | null;
  userDataDir: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  error?: string;
}

/**
 * 浏览器会话管理服务
 * 管理多个 Chrome 实例，每个平台一个独立的用户数据目录
 */
@Injectable()
export class BrowserSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserSessionService.name);

  // 基础配置
  private readonly BASE_DATA_DIR = '/tmp/chrome-aiops-sessions';
  private readonly BASE_DEBUG_PORT = 9300; // 每个平台一个端口，从 9300 开始
  private readonly MAX_SESSIONS = 10;

  // 活跃的 Chrome 会话
  private sessions: Map<string, ChromeSession> = new Map();

  // 主 Chrome 实例（用于手动登录）- 已废弃，改用 ClaudeShellQueueService 统一管理
  private mainChromeProcess: ChildProcess | null = null;
  // 使用独立端口 9223，避免与用户日常使用的 Chrome 冲突
  private readonly MAIN_CHROME_PORT = 9223;

  constructor(
    @InjectModel(SiteLogin.name) private siteLoginModel: Model<SiteLoginDocument>,
    @Inject(forwardRef(() => ClaudeShellQueueService))
    private claudeQueueService: ClaudeShellQueueService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  /**
   * 初始化服务
   */
  private async initialize() {
    this.logger.log('🚀 初始化浏览器会话管理服务');

    // 确保基础目录存在
    await fs.promises.mkdir(this.BASE_DATA_DIR, { recursive: true });

    // 初始化平台登录配置
    await this.initPlatformConfigs();

    this.logger.log('✅ 浏览器会话管理服务已就绪');
  }

  /**
   * 初始化平台登录配置到数据库
   * 所有平台默认使用共享的 Chrome 配置（用户真实配置）
   * 每次启动时同步更新配置（确保代码中的最新选择器生效）
   */
  private async initPlatformConfigs() {
    for (const [platform, config] of Object.entries(PLATFORM_CONFIGS)) {
      const existing = await this.siteLoginModel.findOne({ platform });
      if (!existing) {
        // 所有平台默认使用共享的 Chrome 用户配置目录
        await this.siteLoginModel.create({
          platform,
          platformName: config.name,
          status: 'logged_out',
          userDataDir: SHARED_CHROME_USER_DATA_DIR, // 使用共享目录
          useSharedProfile: true, // 默认使用共享配置
          loginValidityHours: config.loginValidityHours || 24 * 7,
          checkConfig: {
            checkUrl: config.checkUrl,
            loginUrl: config.loginUrl,
            domain: config.domain,
            loginCookies: config.loginCookies,
          },
          enabled: true,
        });
        this.logger.log(`📝 初始化平台配置: ${config.name} (共享模式)`);
      } else {
        // 已存在的平台：同步更新配置（确保代码中的最新 Cookie 配置生效）
        const updateData: any = {
          checkConfig: {
            checkUrl: config.checkUrl,
            loginUrl: config.loginUrl,
            domain: config.domain,
            loginCookies: config.loginCookies,
          },
          loginValidityHours: config.loginValidityHours || existing.loginValidityHours || 24 * 7,
        };

        // 如果之前使用独立目录（/tmp/），迁移到共享模式
        if (!existing.useSharedProfile || existing.userDataDir.startsWith('/tmp/')) {
          updateData.userDataDir = SHARED_CHROME_USER_DATA_DIR;
          updateData.useSharedProfile = true;
          this.logger.log(`🔄 迁移平台配置到共享模式: ${config.name}`);
        }

        await this.siteLoginModel.updateOne({ platform }, { $set: updateData });
        this.logger.log(`🔄 同步平台配置: ${config.name}`);
      }
    }
  }

  /**
   * 关闭服务
   */
  private async shutdown() {
    this.logger.log('🛑 关闭浏览器会话管理服务');

    // 关闭所有会话
    for (const [platform, session] of this.sessions) {
      await this.stopSession(platform);
    }

    // 关闭主 Chrome
    await this.stopMainChrome();

    this.logger.log('✅ 浏览器会话管理服务已关闭');
  }

  /**
   * 获取 Chrome 可执行文件路径
   */
  private getChromePath(): string {
    const platform = process.platform;

    if (platform === 'darwin') {
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    } else if (platform === 'linux') {
      const paths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    } else if (platform === 'win32') {
      const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
    }

    return '';
  }

  /**
   * 检查端口是否可用
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  }

  /**
   * 检查 Chrome 调试端口是否就绪
   */
  private async isChromeDebugReady(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * 获取平台的调试端口
   */
  private getPortForPlatform(platform: string): number {
    const platforms = Object.keys(PLATFORM_CONFIGS);
    const index = platforms.indexOf(platform);
    return this.BASE_DEBUG_PORT + (index >= 0 ? index : platforms.length);
  }

  /**
   * 启动指定平台的 Chrome 会话（无头模式，用于自动化）
   */
  async startSession(platform: string, headless: boolean = true): Promise<ChromeSession> {
    const siteLogin = await this.siteLoginModel.findOne({ platform });
    if (!siteLogin) {
      throw new Error(`平台 ${platform} 未配置`);
    }

    // 检查是否已有会话
    const existing = this.sessions.get(platform);
    if (existing && existing.status === 'running') {
      return existing;
    }

    const chromePath = this.getChromePath();
    if (!chromePath) {
      throw new Error('未找到 Chrome 浏览器');
    }

    const port = this.getPortForPlatform(platform);
    const userDataDir = siteLogin.userDataDir;

    // 确保用户数据目录存在
    await fs.promises.mkdir(userDataDir, { recursive: true });

    this.logger.log(`🚀 启动 Chrome 会话: ${platform} (端口: ${port})`);

    const session: ChromeSession = {
      platform,
      port,
      process: null,
      userDataDir,
      status: 'starting',
    };
    this.sessions.set(platform, session);

    try {
      const args = [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--enable-features=NetworkService,NetworkServiceInProcess',
      ];

      if (headless) {
        args.push('--headless=new');
      }

      const child = spawn(chromePath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      session.process = child;

      child.on('error', (error) => {
        this.logger.error(`Chrome 会话错误 (${platform}):`, error.message);
        session.status = 'error';
        session.error = error.message;
      });

      child.on('exit', (code) => {
        this.logger.log(`Chrome 会话退出 (${platform}): code=${code}`);
        session.status = 'stopped';
        session.process = null;
      });

      // 等待 Chrome 就绪
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await this.isChromeDebugReady(port)) {
          session.status = 'running';
          this.logger.log(`✅ Chrome 会话就绪: ${platform}`);
          return session;
        }
      }

      throw new Error('Chrome 启动超时');
    } catch (error) {
      session.status = 'error';
      session.error = error.message;
      throw error;
    }
  }

  /**
   * 停止指定平台的 Chrome 会话
   */
  async stopSession(platform: string): Promise<void> {
    const session = this.sessions.get(platform);
    if (!session || !session.process) {
      return;
    }

    this.logger.log(`🛑 停止 Chrome 会话: ${platform}`);

    session.process.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        session.process?.kill('SIGKILL');
        resolve();
      }, 5000);

      session.process?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    session.status = 'stopped';
    session.process = null;
  }

  /**
   * 启动主 Chrome（有界面，用于手动登录）
   * 现在统一使用 ClaudeShellQueueService 管理 Chrome 实例
   * 会自动跳转到目标平台的登录页面
   */
  async startMainChrome(platform?: string): Promise<{ port: number; url: string }> {
    // 确定用户数据目录和登录 URL
    let userDataDir = path.join(this.BASE_DATA_DIR, 'main');
    let loginUrl = 'about:blank';

    if (platform) {
      const siteLogin = await this.siteLoginModel.findOne({ platform });
      if (siteLogin) {
        userDataDir = siteLogin.userDataDir;
        // 优先使用数据库中的配置，否则使用内置配置
        loginUrl = siteLogin.checkConfig?.loginUrl ||
                   PLATFORM_CONFIGS[platform]?.loginUrl ||
                   'about:blank';
      } else if (PLATFORM_CONFIGS[platform]) {
        loginUrl = PLATFORM_CONFIGS[platform].loginUrl;
      }
    }

    await fs.promises.mkdir(userDataDir, { recursive: true });

    this.logger.log(`🚀 启动主 Chrome (platform: ${platform || 'none'}, userDataDir: ${userDataDir}, loginUrl: ${loginUrl})`);

    // 检查是否需要切换 userDataDir
    const currentDir = this.claudeQueueService.getCurrentChromeUserDataDir();
    const needRestart = currentDir !== userDataDir;

    // 使用 ClaudeShellQueueService 统一管理 Chrome
    // 参数: userDataDir, forceRestart, headless=false（显示窗口供用户登录）, startUrl
    const chromeStarted = await this.claudeQueueService.startChrome(
      userDataDir,
      needRestart,
      false, // 显示窗口
      loginUrl, // 直接打开登录页
    );

    if (!chromeStarted) {
      throw new Error('Chrome 启动失败');
    }

    // 如果 Chrome 已经在运行且 userDataDir 匹配，需要手动导航到登录页
    if (!needRestart && loginUrl !== 'about:blank') {
      await this.claudeQueueService.navigateToUrl(loginUrl);
    }

    // 标记主 Chrome 正在运行（用于状态查询）
    this.mainChromeProcess = { pid: 1 } as any; // 占位符，实际进程由 ClaudeShellQueueService 管理

    return { port: this.MAIN_CHROME_PORT, url: loginUrl };
  }

  /**
   * 停止主 Chrome
   * 现在统一使用 ClaudeShellQueueService 管理 Chrome 实例
   */
  async stopMainChrome(): Promise<void> {
    this.logger.log('🛑 停止主 Chrome');
    await this.claudeQueueService.stopChrome();
    this.mainChromeProcess = null;
  }

  /**
   * 获取所有会话状态
   */
  getAllSessions(): ChromeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取指定平台的会话
   */
  getSession(platform: string): ChromeSession | undefined {
    return this.sessions.get(platform);
  }

  /**
   * 检查主 Chrome 是否运行
   * 现在统一使用 ClaudeShellQueueService 管理 Chrome 实例
   */
  isMainChromeRunning(): boolean {
    return this.claudeQueueService.isChromeRunning();
  }

  /**
   * 获取所有平台配置
   */
  getPlatformConfigs() {
    return PLATFORM_CONFIGS;
  }

  /**
   * 获取平台的调试信息
   */
  async getDebugInfo(platform: string): Promise<any> {
    const session = this.sessions.get(platform);
    const siteLogin = await this.siteLoginModel.findOne({ platform });

    return {
      platform,
      platformName: PLATFORM_CONFIGS[platform]?.name,
      session: session ? {
        port: session.port,
        status: session.status,
        userDataDir: session.userDataDir,
        error: session.error,
      } : null,
      loginStatus: siteLogin ? {
        status: siteLogin.status,
        username: siteLogin.username,
        lastLoginTime: siteLogin.lastLoginTime,
        lastCheckTime: siteLogin.lastCheckTime,
        lastError: siteLogin.lastError,
      } : null,
    };
  }
}
