import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { User } from '../users/user.entity';

export enum BetStatus {
  ESCROWED = 'escrowed',   // credits deducted from user, held pending settlement
  SETTLED = 'settled',     // game ended, pot transferred
  REFUNDED = 'refunded',   // returned to user (no opponent matched, or draw, or admin refund)
  FROZEN = 'frozen',       // disagreement between players — held for admin review
  EXPIRED = 'expired',     // never matched within window — auto-refunded by cron
}

export enum BetResult {
  WIN = 'win',
  LOSS = 'loss',
  DRAW = 'draw',
}

@Entity('bets')
@Index(['user', 'status'])
@Index(['roomId'])
export class Bet extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'enum', enum: BetStatus, default: BetStatus.ESCROWED })
  status: BetStatus;

  // Set by relay once the bet is bound to a room (immediately on escrow if known, else null)
  @Column({ nullable: true, length: 64 })
  roomId: string | null;

  // Set on settle — the opposing player's bet id
  @Column({ nullable: true, type: 'uuid' })
  opponentBetId: string | null;

  @Column({ type: 'enum', enum: BetResult, nullable: true })
  result: BetResult | null;

  // Net credit delta credited back to the user on settlement.
  // win=+2*amount, loss=0, draw=+amount, refund=+amount
  @Column({ type: 'int', default: 0 })
  payout: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}
