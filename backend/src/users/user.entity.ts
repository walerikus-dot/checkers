import { Entity, Column, OneToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { Rating } from '../ratings/rating.entity';
import { Game } from '../games/game.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ nullable: true, length: 20 })
  oauthProvider: string;

  @Column({ nullable: true })
  oauthId: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true, length: 60 })
  country: string;

  @Column({ nullable: true, length: 2 })
  countryCode: string;

  @Column({ nullable: true, length: 32 })
  phone: string;

  @Column({ nullable: true, length: 5 })
  language: string;

  /* ── Email-change flow (re-confirm via email link) ───── */
  @Column({ nullable: true, length: 255 })
  pendingEmail: string;

  @Column({ nullable: true, length: 64 })
  emailChangeToken: string;

  @Column({ nullable: true, type: 'timestamptz' })
  emailChangeTokenExpires: Date;

  @Column({ default: false })
  isOnline: boolean;

  /* ── Progression (synced from client) ──── */
  @Column({ default: 0 })
  xp: number;

  @Column({ default: 0 })
  credits: number;

  @Column({ default: 0 })
  streak: number;

  @Column({ default: 0 })
  totalWins: number;

  @Column({ default: 0 })
  totalGames: number;

  @Column({ default: false })
  firstWinBonus: boolean;

  @OneToOne(() => Rating, (rating) => rating.user, { cascade: true })
  rating: Rating;

  @OneToMany(() => Game, (game) => game.playerWhite)
  gamesAsWhite: Game[];

  @OneToMany(() => Game, (game) => game.playerBlack)
  gamesAsBlack: Game[];
}
