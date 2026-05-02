import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Game } from '../games/game.entity';
import { User } from '../users/user.entity';

@Entity('moves')
export class Move extends BaseEntity {
  @ManyToOne(() => Game, (game) => game.moves, { onDelete: 'CASCADE' })
  @JoinColumn()
  game: Game;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  moveNumber: number;

  @Column({ length: 5 })
  fromCell: string;

  @Column({ length: 5 })
  toCell: string;

  @Column({ type: 'jsonb', nullable: true })
  captures: string[];

  @Column({ default: false })
  isDamaPromotion: boolean;
}
