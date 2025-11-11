import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ContentCategory, AudienceLevel } from '../../crawler/interfaces/content-classification.interface';

export type UserInterestDocument = UserInterest & Document;

@Schema({ collection: 'user_interests', timestamps: true })
export class UserInterest {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({
    type: [
      {
        category: { type: String, enum: Object.values(ContentCategory) },
        weight: { type: Number, min: 0, max: 1 },
      },
    ],
    default: [],
  })
  categories: Array<{
    category: ContentCategory;
    weight: number;
  }>;

  @Prop({
    type: [
      {
        keyword: String,
        score: Number,
        lastUpdated: Date,
      },
    ],
    default: [],
  })
  keywords: Array<{
    keyword: string;
    score: number;
    lastUpdated: Date;
  }>;

  @Prop({
    type: [
      {
        articleId: String,
        rating: Number,
        readTime: Number,
        completed: Boolean,
        timestamp: Date,
      },
    ],
    default: [],
  })
  readHistory: Array<{
    articleId: string;
    rating?: number;
    readTime?: number;
    completed: boolean;
    timestamp: Date;
  }>;

  @Prop({
    type: {
      preferredPlatforms: [String],
      preferredAuthors: [String],
      contentLengthRange: [Number],
      updateFrequency: String,
      audienceLevel: { type: String, enum: Object.values(AudienceLevel) },
    },
    default: {},
  })
  preferences: {
    preferredPlatforms?: string[];
    preferredAuthors?: string[];
    contentLengthRange?: [number, number];
    updateFrequency?: string;
    audienceLevel?: AudienceLevel;
  };

  @Prop({
    type: {
      totalArticlesRead: { type: Number, default: 0 },
      avgReadingTime: { type: Number, default: 0 },
      lastActiveDate: Date,
    },
    default: { totalArticlesRead: 0, avgReadingTime: 0 },
  })
  stats: {
    totalArticlesRead: number;
    avgReadingTime: number;
    lastActiveDate?: Date;
  };
}

export const UserInterestSchema = SchemaFactory.createForClass(UserInterest);

// 创建索引（userId 已通过 unique: true 自动创建，无需重复）
UserInterestSchema.index({ 'readHistory.timestamp': -1 });
