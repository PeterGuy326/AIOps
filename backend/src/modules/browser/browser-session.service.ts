import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { SiteLogin, SiteLoginDocument } from '../database/schemas/site-login.schema';

/**
 * 平台登录检测配置
 */
export const PLATFORM_CONFIGS: Record<string, {
  name: string;
  checkUrl: string;
  loginUrl: string;
  loggedInSelector?: string;
  loggedOutSelector?: string;
  usernameSelector?: string;
  avatarSelector?: string;
}> = {
  zhihu: {
    name: '知乎',
    checkUrl: 'https://www.zhihu.com/',
    loginUrl: 'https://www.zhihu.com/signin',
    loggedInSelector: '.AppHeader-profile',
    loggedOutSelector: '.SignContainer-content',
    usernameSelector: '.AppHeader-profile img',
    avatarSelector: '.AppHeader-profile img',
  },
  xiaohongshu: {
    name: '小红书',
    checkUrl: 'https://www.xiaohongshu.com/',
    loginUrl: 'https://www.xiaohongshu.com/',
    loggedInSelector: '.user-info',
    loggedOutSelector: '.login-btn',
  },
  weixin: {
    name: '微信公众号',
    checkUrl: 'https://mp.weixin.qq.com/',
    loginUrl: 'https://mp.weixin.qq.com/',
    loggedInSelector: '.weui-desktop-account',
    loggedOutSelector: '.login__type__container',
  },
  weibo: {
    name: '微博',
    checkUrl: 'https://weibo.com/',
    loginUrl: 'https://weibo.com/login.php',
    loggedInSelector: '.woo-avatar-img',
    loggedOutSelector: '.LoginCard_wrap',
  },
  bilibili: {
    name: 'B站',
    checkUrl: 'https://www.bilibili.com/',
    loginUrl: 'https://passport.bilibili.com/login',
    loggedInSelector: '.header-avatar-wrap',
    loggedOutSelector: '.header-login-entry',
  },
  douyin: {
    name: '抖音',
    checkUrl: 'https://www.douyin.com/',
    loginUrl: 'https://www.douyin.com/',
    loggedInSelector: '.avatar-icon',
    loggedOutSelector: '.login-guide',
  },
  toutiao: {
    name: '今日头条',
    checkUrl: 'https://www.toutiao.com/',
    loginUrl: 'https://www.toutiao.com/',
    loggedInSelector: '.avatar-wrap',
    loggedOutSelector: '.login-button',
  },
  juejin: {
    name: '掘金',
    checkUrl: 'https://juejin.cn/',
    loginUrl: 'https://juejin.cn/login',
    loggedInSelector: '.avatar',
    loggedOutSelector: '.login-button',
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

  // 主 Chrome 实例（用于手动登录）
  private mainChromeProcess: ChildProcess | null = null;
  private readonly MAIN_CHROME_PORT = 9222;

  constructor(
    @InjectModel(SiteLogin.name) private siteLoginModel: Model<SiteLoginDocument>,
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
   */
  private async initPlatformConfigs() {
    for (const [platform, config] of Object.entries(PLATFORM_CONFIGS)) {
      const existing = await this.siteLoginModel.findOne({ platform });
      if (!existing) {
        const userDataDir = path.join(this.BASE_DATA_DIR, platform);
        await this.siteLoginModel.create({
          platform,
          platformName: config.name,
          status: 'logged_out',
          userDataDir,
          checkConfig: {
            checkUrl: config.checkUrl,
            loginUrl: config.loginUrl,
            loggedInSelector: config.loggedInSelector,
            loggedOutSelector: config.loggedOutSelector,
            usernameSelector: config.usernameSelector,
            avatarSelector: config.avatarSelector,
          },
          enabled: true,
        });
        this.logger.log(`📝 初始化平台配置: ${config.name}`);
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
   */
  async startMainChrome(platform?: string): Promise<{ port: number; url: string }> {
    // 如果已经运行，直接返回
    if (await this.isChromeDebugReady(this.MAIN_CHROME_PORT)) {
      const url = platform
        ? PLATFORM_CONFIGS[platform]?.loginUrl || 'about:blank'
        : 'about:blank';
      return { port: this.MAIN_CHROME_PORT, url };
    }

    const chromePath = this.getChromePath();
    if (!chromePath) {
      throw new Error('未找到 Chrome 浏览器');
    }

    // 使用指定平台的用户数据目录
    let userDataDir = path.join(this.BASE_DATA_DIR, 'main');
    if (platform) {
      const siteLogin = await this.siteLoginModel.findOne({ platform });
      if (siteLogin) {
        userDataDir = siteLogin.userDataDir;
      }
    }

    await fs.promises.mkdir(userDataDir, { recursive: true });

    const startUrl = platform
      ? PLATFORM_CONFIGS[platform]?.loginUrl || 'about:blank'
      : 'about:blank';

    this.logger.log(`🚀 启动主 Chrome (端口: ${this.MAIN_CHROME_PORT})`);

    this.mainChromeProcess = spawn(chromePath, [
      `--remote-debugging-port=${this.MAIN_CHROME_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      startUrl,
    ], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.mainChromeProcess.on('exit', () => {
      this.logger.log('主 Chrome 已关闭');
      this.mainChromeProcess = null;
    });

    // 等待就绪
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await this.isChromeDebugReady(this.MAIN_CHROME_PORT)) {
        this.logger.log('✅ 主 Chrome 已就绪');
        return { port: this.MAIN_CHROME_PORT, url: startUrl };
      }
    }

    throw new Error('主 Chrome 启动超时');
  }

  /**
   * 停止主 Chrome
   */
  async stopMainChrome(): Promise<void> {
    if (!this.mainChromeProcess) {
      return;
    }

    this.logger.log('🛑 停止主 Chrome');
    this.mainChromeProcess.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.mainChromeProcess?.kill('SIGKILL');
        resolve();
      }, 5000);

      this.mainChromeProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

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
   */
  isMainChromeRunning(): boolean {
    return this.mainChromeProcess !== null;
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
