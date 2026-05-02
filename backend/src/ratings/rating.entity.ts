import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';

@Entity('ratings')
export class Rating extends BaseEntity {
  @OneToOne(() => User, (user) => user.rating)
  @JoinColumn()
  user: User;

  @Column({ type: 'float', default: 1500 })
  rating: number;

  @Column({ type: 'float', default: 350 })
  rd: number;

  @Column({ type: 'float', default: 0.06 })
  volatility: number;

  @Column({ default: 0 })
  gamesPlayed: number;

  @Column({ default: 0 })
  wins: number;

  @Column({ default: 0 })
  losses: number;

  @Column({ default: 0 })
  draws: number;
}
