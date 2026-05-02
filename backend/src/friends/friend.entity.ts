import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';

export enum FriendStatus { PENDING = 'pending', ACCEPTED = 'accepted', BLOCKED = 'blocked' }

@Entity('friends')
@Unique(['user', 'friend'])
export class Friend extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn() user: User;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn() friend: User;
  @Column({ type: 'enum', enum: FriendStatus, default: FriendStatus.PENDING }) status: FriendStatus;
}
