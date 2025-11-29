import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClaudeTaskDocument = ClaudeTask & Document;

/**
 * 日志条目
 */
@Schema({ _id: false })
export class TaskLog {
  @Prop({ required: true, type: Number })
  timestamp: number;

  @Prop({ required: true, enum: ['stdout', 'stderr', 'system'] })
  type: 'stdout' | 'stderr' | 'system';

  @Prop({ required: true, type: String })
  content: string;
}

export const TaskLogSchema = SchemaFactory.createForClass(TaskLog);

/**
 * Claude 任务记录
 */
@Schema({ collection: 'claude_tasks', timestamps: true })
export class ClaudeTask {
  @Prop({ required: true, unique: true, index: true })
  taskId: string;

  @Prop({ required: true, type: Number })
  workerId: number;

  @Prop({ type: Number })
  pid?: number;

  @Prop({ required: true, enum: ['running', 'completed', 'failed', 'timeout'], index: true })
  status: 'running' | 'completed' | 'failed' | 'timeout';

  @Prop({ required: true, type: Number, index: true })
  startTime: number;

  @Prop({ type: Number })
  endTime?: number;

  @Prop({ type: Number })
  duration?: number;

  @Prop({ required: true, type: String })
  prompt: string;

  @Prop({ type: String })
  result?: string;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: [TaskLogSchema], default: [] })
  logs: TaskLog[];

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const ClaudeTaskSchema = SchemaFactory.createForClass(ClaudeTask);

// 创建索引
ClaudeTaskSchema.index({ startTime: -1 });
ClaudeTaskSchema.index({ status: 1, startTime: -1 });
ClaudeTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 天后自动删除
