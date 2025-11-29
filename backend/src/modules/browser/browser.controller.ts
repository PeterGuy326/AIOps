import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BrowserSessionService, PLATFORM_CONFIGS } from './browser-session.service';
import { LoginCheckService } from './login-check.service';

@Controller('browser')
export class BrowserController {
  constructor(
    private browserSessionService: BrowserSessionService,
    private loginCheckService: LoginCheckService,
  ) {}

  // ==================== 平台配置 ====================

  /**
   * 获取所有平台配置
   * GET /browser/platform/list
   */
  @Get('platform/list')
  async getPlatformList() {
    const platforms = await this.loginCheckService.getAllLoginStatus();
    const configs = this.browserSessionService.getPlatformConfigs();

    return {
      platforms: platforms.map(p => ({
        platform: p.platform,
        platformName: p.platformName,
        status: p.status,
        username: p.username,
        avatarUrl: p.avatarUrl,
        lastLoginTime: p.lastLoginTime,
        lastCheckTime: p.lastCheckTime,
        lastError: p.lastError,
        enabled: p.enabled,
        loginUrl: p.checkConfig?.loginUrl || configs[p.platform]?.loginUrl,
      })),
    };
  }

  /**
   * 获取指定平台详情
   * GET /browser/platform/detail/:platform
   */
  @Get('platform/detail/:platform')
  async getPlatformDetail(@Param('platform') platform: string) {
    const loginStatus = await this.loginCheckService.getLoginStatus(platform);
    const debugInfo = await this.browserSessionService.getDebugInfo(platform);

    if (!loginStatus) {
      throw new HttpException('平台未配置', HttpStatus.NOT_FOUND);
    }

    return {
      ...loginStatus.toObject(),
      debug: debugInfo,
    };
  }

  /**
   * 添加自定义平台
   * POST /browser/platform/add
   */
  @Post('platform/add')
  async addPlatform(
    @Body()
    body: {
      platform: string;
      platformName: string;
      checkUrl: string;
      loginUrl?: string;
      loggedInSelector?: string;
      loggedOutSelector?: string;
    },
  ) {
    if (!body.platform || !body.platformName || !body.checkUrl) {
      throw new HttpException('缺少必要参数', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.loginCheckService.getLoginStatus(body.platform);
    if (existing) {
      throw new HttpException('平台已存在', HttpStatus.CONFLICT);
    }

    const result = await this.loginCheckService.addCustomPlatform(body);
    return { success: true, platform: result };
  }

  /**
   * 更新平台配置
   * POST /browser/platform/update/:platform
   */
  @Post('platform/update/:platform')
  async updatePlatform(
    @Param('platform') platform: string,
    @Body()
    body: {
      platformName?: string;
      enabled?: boolean;
      checkConfig?: any;
      remark?: string;
    },
  ) {
    await this.loginCheckService.updatePlatformConfig(platform, body);
    return { success: true };
  }

  /**
   * 删除平台配置
   * DELETE /browser/platform/remove/:platform
   */
  @Delete('platform/remove/:platform')
  async removePlatform(@Param('platform') platform: string) {
    // 不允许删除内置平台
    if (PLATFORM_CONFIGS[platform]) {
      throw new HttpException('不允许删除内置平台', HttpStatus.FORBIDDEN);
    }

    await this.loginCheckService.removePlatform(platform);
    return { success: true };
  }

  // ==================== 登录状态检测 ====================

  /**
   * 检测所有平台登录状态
   * POST /browser/login/check-all
   */
  @Post('login/check-all')
  async checkAllPlatforms() {
    const results = await this.loginCheckService.checkAllPlatforms();
    return { results };
  }

  /**
   * 检测指定平台登录状态
   * POST /browser/login/check/:platform
   */
  @Post('login/check/:platform')
  async checkPlatformLogin(@Param('platform') platform: string) {
    const result = await this.loginCheckService.checkPlatformLogin(platform);
    return { result };
  }

  /**
   * 手动标记为已登录
   * POST /browser/login/mark-logged-in/:platform
   */
  @Post('login/mark-logged-in/:platform')
  async markAsLoggedIn(
    @Param('platform') platform: string,
    @Body() body: { username?: string },
  ) {
    await this.loginCheckService.markAsLoggedIn(platform, body.username);
    return { success: true };
  }

  /**
   * 手动标记为未登录
   * POST /browser/login/mark-logged-out/:platform
   */
  @Post('login/mark-logged-out/:platform')
  async markAsLoggedOut(@Param('platform') platform: string) {
    await this.loginCheckService.markAsLoggedOut(platform);
    return { success: true };
  }

  // ==================== Chrome 会话管理 ====================

  /**
   * 获取所有 Chrome 会话状态
   * GET /browser/session/list
   */
  @Get('session/list')
  async getSessionList() {
    const sessions = this.browserSessionService.getAllSessions();
    return {
      sessions: sessions.map(s => ({
        platform: s.platform,
        port: s.port,
        status: s.status,
        userDataDir: s.userDataDir,
        error: s.error,
      })),
      mainChromeRunning: this.browserSessionService.isMainChromeRunning(),
    };
  }

  /**
   * 启动指定平台的 Chrome 会话（无头模式）
   * POST /browser/session/start/:platform
   */
  @Post('session/start/:platform')
  async startSession(
    @Param('platform') platform: string,
    @Query('headless') headless: string = 'true',
  ) {
    const session = await this.browserSessionService.startSession(
      platform,
      headless !== 'false',
    );
    return {
      success: true,
      session: {
        platform: session.platform,
        port: session.port,
        status: session.status,
      },
    };
  }

  /**
   * 停止指定平台的 Chrome 会话
   * POST /browser/session/stop/:platform
   */
  @Post('session/stop/:platform')
  async stopSession(@Param('platform') platform: string) {
    await this.browserSessionService.stopSession(platform);
    return { success: true };
  }

  /**
   * 启动主 Chrome（有界面，用于手动登录）
   * POST /browser/chrome/start
   */
  @Post('chrome/start')
  async startMainChrome(@Body() body: { platform?: string }) {
    const result = await this.browserSessionService.startMainChrome(body.platform);
    return {
      success: true,
      port: result.port,
      url: result.url,
      message: '请在打开的 Chrome 浏览器中完成登录，登录后点击"验证登录状态"按钮',
    };
  }

  /**
   * 停止主 Chrome
   * POST /browser/chrome/stop
   */
  @Post('chrome/stop')
  async stopMainChrome() {
    await this.browserSessionService.stopMainChrome();
    return { success: true };
  }

  /**
   * 获取主 Chrome 状态
   * GET /browser/chrome/status
   */
  @Get('chrome/status')
  async getMainChromeStatus() {
    return {
      running: this.browserSessionService.isMainChromeRunning(),
    };
  }

  // ==================== 辅助接口 ====================

  /**
   * 获取内置平台配置
   * GET /browser/config/builtin
   */
  @Get('config/builtin')
  async getBuiltinConfigs() {
    return {
      platforms: Object.entries(PLATFORM_CONFIGS).map(([key, config]) => ({
        platform: key,
        ...config,
      })),
    };
  }
}
