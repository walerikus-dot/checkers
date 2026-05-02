import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../common/entities/base.entity';
import { TournamentFormat } from './tournament.entity';

/**
 * Persisted auto-schedule configuration.
 * The scheduler service reads these rows and creates new tournaments accordingly.
 *
 * cronExpression examples:
 *   '0 18 * * *'   → every day at 18:00
 *   '0 18 * * 6'   → every Saturday at 18:00
 *   '0 12 * * 1'   → every Monday at 12:00
 */
@Entity('tournament_schedules')
export class TournamentSchedule extends BaseEntity {
  @Column({ length: 255 })
  name: string;                     // Template name, e.g. "Daily Russian 8-player"

  @Column({ type: 'enum', enum: TournamentFormat, default: TournamentFormat.SINGLE_ELIM })
  format: TournamentFormat;

  @Column({ length: 20, default: 'russian' })
  rulesType: string;                // 'russian' | 'english' | 'international'

  @Column({ default: 8 })
  maxPlayers: number;

  @Column({ length: 100 })
  cronExpression: string;           // Standard cron expression (5 fields)

  @Column({ default: 2 })
  registrationHours: number;        // Hours of open registration before auto-start

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  lastRunAt: Date | null;           // When we last created a tournament from this schedule

  @Column({ nullable: true })
  nextRunAt: Date | null;           // Computed next fire time (for display)
}
