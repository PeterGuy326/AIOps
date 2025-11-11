import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('strategies')
export class Strategy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', nullable: true })
  keywords: string[];

  @Column({ name: 'min_likes', type: 'integer', default: 0 })
  minLikes: number;

  @Column({ name: 'content_type', length: 50, nullable: true })
  contentType: string;

  @Column({ name: 'negative_keywords', type: 'jsonb', nullable: true })
  negativeKeywords: string[];

  @Column({ name: 'trend_insight', type: 'text', nullable: true })
  trendInsight: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
