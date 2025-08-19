/* eslint-disable @typescript-eslint/no-explicit-any */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outbox_events')
@Index('idx_outbox_status', ['status'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() aggregate_type!: string;
  @Column('uuid') aggregate_id!: string;
  @Column() type!: string;
  @Column({ type: 'jsonb' }) payload!: any;
  @Column({ default: 'pending' }) status!: 'pending' | 'sent' | 'failed';
  @CreateDateColumn() created_at!: Date;
}
