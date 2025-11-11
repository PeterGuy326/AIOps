import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StrategyDocument = Strategy & Document;

@Schema({ collection: 'strategies', timestamps: true })
export class Strategy {
  @Prop({ type: [String] })
  keywords?: string[];

  @Prop({ type: Number, default: 0 })
  minLikes: number;

  @Prop({ maxlength: 50 })
  contentType?: string;

  @Prop({ type: [String] })
  negativeKeywords?: string[];

  @Prop({ type: String })
  trendInsight?: string;

  @Prop({ maxlength: 50, default: 'pending' })
  status: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const StrategySchema = SchemaFactory.createForClass(Strategy);

// 创建索引
StrategySchema.index({ status: 1 });
StrategySchema.index({ createdAt: -1 });
