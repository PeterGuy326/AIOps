import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ContentCategory } from '../../crawler/interfaces/content-classification.interface';

export type CrawlTemplateDocument = CrawlTemplate & Document;

@Schema({ collection: 'crawl_templates', timestamps: true })
export class CrawlTemplate {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: Object.values(ContentCategory), required: true })
  category: ContentCategory;

  @Prop({ type: Object, required: true })
  config: {
    keywords: string[];
    mustHaveKeywords?: string[];
    negativeKeywords?: string[];
    platforms: string[];
    categories?: ContentCategory[];
    contentTypes?: string[];
    qualityThreshold?: any;
    timeRange?: string;
    targetCount: number;
  };

  @Prop({ type: Object, required: true })
  schedule: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
    cron?: string;
    dayOfWeek?: number;
    hour?: number;
    timezone?: string;
  };

  @Prop({ type: Object, required: true })
  output: {
    format: 'json' | 'markdown' | 'html' | 'pdf';
    destination?: string[];
    notification?: boolean;
    aiSummary?: boolean;
    generateTOC?: boolean;
    categorize?: boolean;
  };

  @Prop({
    type: {
      totalRuns: { type: Number, default: 0 },
      lastRun: Date,
      nextRun: Date,
      avgArticlesPerRun: { type: Number, default: 0 },
      successRate: { type: Number, default: 0 },
    },
    default: { totalRuns: 0, avgArticlesPerRun: 0, successRate: 0 },
  })
  stats: {
    totalRuns: number;
    lastRun?: Date;
    nextRun?: Date;
    avgArticlesPerRun: number;
    successRate: number;
  };

  @Prop({ type: String, enum: ['active', 'paused', 'archived'], default: 'active' })
  status: 'active' | 'paused' | 'archived';

  @Prop()
  createdBy?: string;
}

export const CrawlTemplateSchema = SchemaFactory.createForClass(CrawlTemplate);

// 创建索引
CrawlTemplateSchema.index({ status: 1 });
CrawlTemplateSchema.index({ category: 1 });
CrawlTemplateSchema.index({ 'schedule.enabled': 1 });
