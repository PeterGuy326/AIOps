import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CliHistoryDocument = CliHistory & Document;

@Schema({ collection: 'cli_history', timestamps: false })
export class CliHistory {
  @Prop({ required: true, type: String })
  question: string;

  @Prop({ required: true, type: String })
  answer: string;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const CliHistorySchema = SchemaFactory.createForClass(CliHistory);

// 创建索引
CliHistorySchema.index({ timestamp: -1 });
