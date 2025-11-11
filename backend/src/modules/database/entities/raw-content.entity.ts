import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Site } from './site.entity';

@Entity('raw_content')
export class RawContent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'site_id' })
  siteId: number;

  @ManyToOne(() => Site)
  @JoinColumn({ name: 'site_id' })
  site: Site;

  @Column({ length: 500, nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ length: 100, nullable: true })
  author: string;

  @Column({ type: 'integer', default: 0 })
  likes: number;

  @Column({ length: 500, nullable: true })
  url: string;

  @CreateDateColumn({ name: 'crawled_at' })
  crawledAt: Date;
}
