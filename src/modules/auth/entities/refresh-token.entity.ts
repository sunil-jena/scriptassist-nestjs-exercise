import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('auth_refresh_tokens')
@Index('idx_refresh_user', ['userId'])
@Index('idx_refresh_family', ['familyId'])
@Index('idx_refresh_jti_unique', ['jti'], { unique: true })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'uuid', unique: true })
  jti!: string;

  @Column()
  tokenHash!: string;

  @Column({ default: false })
  revoked!: boolean;

  @Column({ default: false })
  used!: boolean;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
