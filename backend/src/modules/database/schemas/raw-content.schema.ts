import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RawContentDocument = RawContent & Document;

@Schema({ collection: 'raw_content', timestamps: true })
export class RawContent {
  @Prop({ type: Types.ObjectId, ref: 'Site', required: false })
  siteId?: Types.ObjectId;

  @Prop({ maxlength: 500 })
  title?: string;

  @Prop({ maxlength: 1000 })
  summary?: string; // 摘要 (200-500字)

  @Prop({ type: Boolean, default: false })
  hasFullContent?: boolean; // 是否有全文存储在 ES

  @Prop({ maxlength: 100 })
  author?: string;

  @Prop({ type: Number, default: 0 })
  likes: number;

  @Prop({ maxlength: 500 })
  url?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop({ type: Number, default: 0 })
  comments: number;

  @Prop({ type: Number, default: 0 })
  views: number;

  @Prop({ maxlength: 50 })
  platform?: string;

  @Prop({ type: Date })
  publishTime?: Date;

  @Prop({ type: Date, default: Date.now })
  crawledAt: Date;
}

export const RawContentSchema = SchemaFactory.createForClass(RawContent);

// 创建索引以支持搜索
RawContentSchema.index({ title: 'text', summary: 'text', author: 'text' });
RawContentSchema.index({ platform: 1, publishTime: -1 });
RawContentSchema.index({ tags: 1 });
RawContentSchema.index({ crawledAt: -1 });
RawContentSchema.index({ url: 1 }, { unique: true }); // URL 唯一索引
