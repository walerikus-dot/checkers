import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';
import { Game } from '../games/game.entity';

@Entity('messages')
export class Message extends BaseEntity {
  @ManyToOne(() => Game, { onDelete: 'CASCADE', nullable: true }) @JoinColumn() game: Game;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn() sender: User;
  @Column({ length: 500 }) content: string;
}
