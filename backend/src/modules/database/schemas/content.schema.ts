import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContentDocument = Content & Document;

@Schema({ collection: 'contents', timestamps: true })
export class Content {
  @Prop({ required: true, maxlength: 500 })
  title: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ maxlength: 500 })
  imageUrl?: string;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop({ maxlength: 50, default: 'pending' })
  status: string;

  @Prop({ type: Number, default: 0 })
  likes: number;

  @Prop({ type: Number, default: 0 })
  comments: number;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);

// 创建索引
ContentSchema.index({ status: 1 });
ContentSchema.index({ createdAt: -1 });
ContentSchema.index({ publishedAt: -1 });
