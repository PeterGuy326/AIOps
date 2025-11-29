import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SiteLoginDocument = SiteLogin & Document;

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

  /** Chrome 用户数据目录路径 */
  @Prop({ required: true })
  userDataDir: string;

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

  /** 登录过期时间（预估） */
  @Prop({ type: Date })
  expiresAt?: Date;

  /** 登录检测配置 */
  @Prop({ type: Object })
  checkConfig: {
    /** 检测 URL */
    checkUrl: string;
    /** 登录成功的标识选择器（存在则表示已登录） */
    loggedInSelector?: string;
    /** 未登录的标识选择器（存在则表示未登录） */
    loggedOutSelector?: string;
    /** 登录页 URL（用于手动登录） */
    loginUrl?: string;
    /** 用户名选择器（用于获取登录账号信息） */
    usernameSelector?: string;
    /** 头像选择器 */
    avatarSelector?: string;
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
