import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Tournament } from './tournament.entity';
import { User } from '../users/user.entity';

@Entity('tournament_participants')
@Unique(['tournamentId', 'userId'])
export class TournamentParticipant extends BaseEntity {
  @Column() tournamentId: string;
  @ManyToOne(() => Tournament, t => t.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column() userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: 0 }) seed: number;        // assigned when bracket is generated
  @Column({ default: false }) eliminated: boolean;
  @Column({ default: 0 }) wins: number;
  @Column({ default: 0 }) losses: number;
}
