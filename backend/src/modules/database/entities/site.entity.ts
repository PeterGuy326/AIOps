import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 500 })
  url: string;

  @Column({ type: 'jsonb', nullable: true })
  selectors: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
