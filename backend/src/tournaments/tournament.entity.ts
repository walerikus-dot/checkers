import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';
import { TournamentParticipant } from './tournament-participant.entity';
import { TournamentMatch } from './tournament-match.entity';

export enum TournamentFormat {
  SINGLE_ELIM   = 'single_elimination',
  ROUND_ROBIN   = 'round_robin',
  DOUBLE_ELIM   = 'double_elimination',
}
export enum TournamentStatus { PENDING = 'pending', ACTIVE = 'active', COMPLETED = 'completed', CANCELLED = 'cancelled' }

@Entity('tournaments')
export class Tournament extends BaseEntity {
  @Column({ length: 255 }) name: string;
  @Column({ type: 'enum', enum: TournamentFormat, default: TournamentFormat.SINGLE_ELIM }) format: TournamentFormat;
  @Column({ type: 'enum', enum: TournamentStatus, default: TournamentStatus.PENDING }) status: TournamentStatus;
  @Column({ default: 8 }) maxPlayers: number;
  @Column({ length: 20, default: 'russian' }) rulesType: string;
  @Column({ default: false }) autoStarted: boolean;  // created by scheduler
  @ManyToOne(() => User, { nullable: true }) @JoinColumn() createdBy: User;
  @Column({ nullable: true }) startsAt: Date;

  @OneToMany(() => TournamentParticipant, p => p.tournament)
  participants: TournamentParticipant[];

  @OneToMany(() => TournamentMatch, m => m.tournament)
  matches: TournamentMatch[];
}
