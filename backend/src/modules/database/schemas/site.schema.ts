import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SiteDocument = Site & Document;

@Schema({ collection: 'sites', timestamps: true })
export class Site {
  @Prop({ required: true, maxlength: 100 })
  name: string;

  @Prop({ required: true, maxlength: 500 })
  url: string;

  @Prop({ type: Object })
  selectors?: Record<string, any>;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const SiteSchema = SchemaFactory.createForClass(Site);

// 创建索引
SiteSchema.index({ name: 1 });
SiteSchema.index({ url: 1 }, { unique: true });
