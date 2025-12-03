import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SiteLoginDocument = SiteLogin & Document;

/**
 * 共享的 Chrome 配置目录（所有平台共用）
 * 使用用户真实的 Chrome 配置，保留所有登录态
 */
export const SHARED_CHROME_USER_DATA_DIR = (() => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const platform = process.platform;

  if (platform === 'darwin') {
    return `${homeDir}/Library/Application Support/Google/Chrome`;
  } else if (platform === 'linux') {
    return `${homeDir}/.config/google-chrome`;
  } else if (platform === 'win32') {
    return `${process.env.LOCALAPPDATA}/Google/Chrome/User Data`;
  }
  return '/tmp/chrome-aiops-shared';
})();

/**
 * 网站登录状态
 * 管理各个平台的登录会话
 */
@Schema({ collection: 'site_logins', timestamps: true })
export class SiteLogin {
  /** 平台标识（如 zhihu, xiaohongshu, weixin 等） */
  @Prop({ required: true, index: true })
  platform: string;

  /** 平台名称 */
  @Prop({ required: true })
  platformName: string;

  /** 登录状态：logged_in=已登录, logged_out=未登录, expired=已过期, checking=检测中 */
  @Prop({
    required: true,
    enum: ['logged_in', 'logged_out', 'expired', 'checking'],
    default: 'logged_out',
  })
  status: 'logged_in' | 'logged_out' | 'expired' | 'checking';

  /**
   * Chrome 用户数据目录路径
   * 默认使用共享目录（用户真实 Chrome 配置）
   * 也可以配置为独立目录（用于特殊需求）
   */
  @Prop({ required: true, default: SHARED_CHROME_USER_DATA_DIR })
  userDataDir: string;

  /**
   * 是否使用共享的 Chrome 配置
   * true: 使用用户真实 Chrome 配置（推荐，登录一次所有平台共享）
   * false: 使用独立配置目录（隔离模式）
   */
  @Prop({ default: true })
  useSharedProfile: boolean;

  /** 登录用户名/账号（如果能获取） */
  @Prop()
  username?: string;

  /** 登录用户头像 URL */
  @Prop()
  avatarUrl?: string;

  /** 最后登录时间 */
  @Prop({ type: Date })
  lastLoginTime?: Date;

  /** 最后检测时间 */
  @Prop({ type: Date })
  lastCheckTime?: Date;

  /**
   * 登录过期时间（预估）
   * 超过此时间需要重新检测登录状态
   */
  @Prop({ type: Date })
  expiresAt?: Date;

  /**
   * 登录有效期（小时）
   * 用于计算 expiresAt
   * 不同平台的登录有效期不同
   */
  @Prop({ default: 24 * 7 }) // 默认 7 天
  loginValidityHours: number;

  /** 登录检测配置 */
  @Prop({ type: Object })
  checkConfig: {
    /** 检测 URL */
    checkUrl: string;
    /** Cookie 所属域名（如 .zhihu.com） */
    domain?: string;
    /** 登录态 Cookie 名称列表（存在任一即为已登录） */
    loginCookies?: string[];
    /** 登录页 URL（用于手动登录） */
    loginUrl?: string;
  };

  /** 上次检测的错误信息 */
  @Prop()
  lastError?: string;

  /** 备注 */
  @Prop()
  remark?: string;

  /** 是否启用 */
  @Prop({ default: true })
  enabled: boolean;
}

export const SiteLoginSchema = SchemaFactory.createForClass(SiteLogin);

// 创建索引
SiteLoginSchema.index({ platform: 1 }, { unique: true });
SiteLoginSchema.index({ status: 1 });
SiteLoginSchema.index({ lastCheckTime: 1 });
SiteLoginSchema.index({ expiresAt: 1 });
