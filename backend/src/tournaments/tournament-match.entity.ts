import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Tournament } from './tournament.entity';

export type MatchStatus = 'pending' | 'ready' | 'playing' | 'done' | 'bye';
export type BracketSide = 'winners' | 'losers' | 'grand';

@Entity('tournament_matches')
export class TournamentMatch extends BaseEntity {
  @Column() tournamentId: string;
  @ManyToOne(() => Tournament, t => t.matches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column() round: number;      // 1 = first round, increases toward final
  @Column() position: number;   // slot index within the round (0-based)

  @Column({ nullable: true }) player1Id: string | null;
  @Column({ nullable: true }) player2Id: string | null;
  @Column({ nullable: true }) winnerId: string | null;

  @Column({ default: 'pending' }) status: MatchStatus;

  // Which match in the next round this match feeds into (winner advances)
  @Column({ nullable: true }) nextMatchId: string | null;

  // Double-Elimination support — which losers-bracket match the LOSER drops into.
  // Null for LB matches, for terminal WB matches, and for SE/RR formats.
  @Column({ nullable: true, default: null }) nextLoserMatchId: string | null;

  // Which side of the bracket this match belongs to. 'winners' for SE/RR
  // (kept default for backward compatibility); only DE tournaments use 'losers' / 'grand'.
  @Column({ default: 'winners' }) bracket: BracketSide;

  // Live-play wiring — set when the two players agree to start their bracket game.
  @Column({ nullable: true, default: null }) roomId: string | null;
  @Column({ nullable: true, default: null, type: 'timestamp' }) gameStartedAt: Date | null;
}
