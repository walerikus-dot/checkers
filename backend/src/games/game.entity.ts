import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';
import { Move } from '../moves/move.entity';

export enum GameStatus { PENDING = 'pending', ACTIVE = 'active', COMPLETED = 'completed', ABANDONED = 'abandoned' }
export enum RulesType { RUSSIAN = 'russian', INTERNATIONAL = 'international', ENGLISH = 'english' }

@Entity('games')
export class Game extends BaseEntity {
  @ManyToOne(() => User, (user) => user.gamesAsWhite, { nullable: true })
  @JoinColumn()
  playerWhite: User;

  @ManyToOne(() => User, (user) => user.gamesAsBlack, { nullable: true })
  @JoinColumn()
  playerBlack: User;

  @Column({ type: 'enum', enum: RulesType, default: RulesType.RUSSIAN })
  rulesType: RulesType;

  @Column({ default: 8 })
  boardSize: number;

  @Column({ type: 'enum', enum: GameStatus, default: GameStatus.PENDING })
  status: GameStatus;

  @ManyToOne(() => User, { nullable: true })
  winner: User;

  @Column({ type: 'jsonb', nullable: true })
  boardState: any;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  endedAt: Date;

  @Column({ default: false })
  isPrivate: boolean;

  @Column({ nullable: true, length: 10 })
  joinCode: string;

  @OneToMany(() => Move, (move) => move.game)
  moves: Move[];
}
