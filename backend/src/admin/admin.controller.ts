import {
  Controller, Get, Post, Query, Param, Body, UseGuards,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Rating } from '../ratings/rating.entity';
import { Game } from '../games/game.entity';
import { AdminGuard } from './admin.guard';
import { TournamentsService } from '../tournaments/tournaments.service';
import { Tournament } from '../tournaments/tournament.entity';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = process.env.BUG_REPORTS_DIR || '/opt/checkers/bug-reports';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Rating) private ratingRepo: Repository<Rating>,
    @InjectRepository(Game) private gameRepo: Repository<Game>,
    @InjectRepository(Tournament) private tournRepo: Repository<Tournament>,
    private tournSvc: TournamentsService,
  ) {}

  /* ── Dashboard stats ─────────────────────────────── */

  @Get('stats')
  async stats() {
    const totalUsers = await this.userRepo.count();
    const onlineUsers = await this.userRepo.count({ where: { isOnline: true } });
    const totalGames = await this.gameRepo.count();
    const totalRatings = await this.ratingRepo.count();

    // Registrations per day (last 30 days)
    const recentReg = await this.userRepo
      .createQueryBuilder('u')
      .select("TO_CHAR(u.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where("u.createdAt > NOW() - INTERVAL '30 days'")
      .groupBy('day')
      .orderBy('day', 'DESC')
      .getRawMany();

    // Games per status
    const gamesByStatus = await this.gameRepo
      .createQueryBuilder('g')
      .select('g.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('g.status')
      .getRawMany();

    return { totalUsers, onlineUsers, totalGames, totalRatings, recentReg, gamesByStatus };
  }

  /* ── Users list ───────────────────────────────────── */

  @Get('users')
  async users(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('search') search?: string,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));

    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.rating', 'r');

    if (search) {
      qb.where('u.username ILIKE :s OR u.email ILIKE :s', { s: `%${search}%` });
    }

    const validSorts: Record<string, string> = {
      createdAt: 'u.createdAt',
      username: 'u.username',
      email: 'u.email',
      rating: 'r.rating',
      gamesPlayed: 'r.gamesPlayed',
      xp: 'u.xp',
      credits: 'u.credits',
      totalGames: 'u.totalGames',
    };
    const sortCol = validSorts[sort] || 'u.createdAt';

    qb.orderBy(sortCol, order)
      .skip((p - 1) * l)
      .take(l);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        oauthProvider: u.oauthProvider || null,
        isOnline: u.isOnline,
        createdAt: u.createdAt,
        rating: u.rating ? Math.round(u.rating.rating) : null,
        rd: u.rating ? Math.round(u.rating.rd) : null,
        gamesPlayed: u.rating?.gamesPlayed ?? 0,
        wins: u.rating?.wins ?? 0,
        losses: u.rating?.losses ?? 0,
        draws: u.rating?.draws ?? 0,
        xp: u.xp || 0,
        credits: u.credits || 0,
        totalWins: u.totalWins || 0,
        totalGames: u.totalGames || 0,
      })),
      total,
      page: p,
      pages: Math.ceil(total / l),
    };
  }

  /* ── Single user detail ──────────────────────────── */

  @Get('users/:id')
  async userDetail(@Param('id') id: string) {
    const u = await this.userRepo.findOne({ where: { id }, relations: ['rating'] });
    if (!u) throw new NotFoundException('User not found');

    // Count games
    const gamesWhite = await this.gameRepo.count({ where: { playerWhite: { id } } });
    const gamesBlack = await this.gameRepo.count({ where: { playerBlack: { id } } });

    return {
      id: u.id,
      username: u.username,
      email: u.email,
      oauthProvider: u.oauthProvider || null,
      avatarUrl: u.avatarUrl,
      isOnline: u.isOnline,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      hasPassword: !!u.passwordHash,
      rating: u.rating ? {
        rating: Math.round(u.rating.rating),
        rd: Math.round(u.rating.rd),
        gamesPlayed: u.rating.gamesPlayed,
        wins: u.rating.wins,
        losses: u.rating.losses,
        draws: u.rating.draws,
      } : null,
      totalGames: gamesWhite + gamesBlack,
      progress: {
        xp: u.xp || 0,
        credits: u.credits || 0,
        totalWins: u.totalWins || 0,
        totalGames: u.totalGames || 0,
        streak: u.streak || 0,
        firstWinBonus: u.firstWinBonus || false,
      },
    };
  }

  /* ── Reset password ──────────────────────────────── */

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body('password') password?: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const newPass = password || this.generateTempPassword();
    user.passwordHash = await bcrypt.hash(newPass, 12);
    await this.userRepo.save(user);

    return { ok: true, tempPassword: newPass, username: user.username, email: user.email };
  }

  private generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)];
    return pass + '!';
  }

  /* ── Bug reports ─────────────────────────────────── */

  @Get('bug-reports')
  async bugReports() {
    if (!fs.existsSync(REPORTS_DIR)) return { reports: [] };
    const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
    const reports = files.map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), 'utf8'));
        return { filename: f, ...data };
      } catch {
        return { filename: f, error: 'Could not parse' };
      }
    });
    return { reports, total: reports.length };
  }

  @Post('bug-reports/:filename/delete')
  async deleteBugReport(@Param('filename') filename: string) {
    const filepath = path.join(REPORTS_DIR, filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Report not found');
    fs.unlinkSync(filepath);
    return { ok: true };
  }

  /* ── Tournaments ─────────────────────────────────── */

  @Get('tournaments')
  async tournaments(
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('status') status?: string,
  ) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const qb = this.tournRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.createdBy', 'u')
      .leftJoin('t.participants', 'pt')
      .addSelect('COUNT(pt.id)', 'participantCount')
      .groupBy('t.id')
      .addGroupBy('u.id')
      .orderBy('t.createdAt', 'DESC')
      .skip((p - 1) * l)
      .take(l);

    if (status) qb.where('t.status = :status', { status });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: p, pages: Math.ceil(total / l) };
  }

  @Post('tournaments/:id/start')
  adminStartTournament(@Param('id') id: string) {
    return this.tournSvc.start(id);
  }

  @Post('tournaments/:id/cancel')
  adminCancelTournament(@Param('id') id: string) {
    return this.tournSvc.cancel(id);
  }

  @Post('tournaments/:id/matches/:matchId/result')
  adminReportResult(
    @Param('id') id: string,
    @Param('matchId') matchId: string,
    @Body() body: { winnerId: string | null },
  ) {
    return this.tournSvc.reportResult(id, matchId, body.winnerId);
  }

  /* ── Schedules ────────────────────────────────────── */

  @Get('tournament-schedules')
  listSchedules() { return this.tournSvc.listSchedules(); }

  @Post('tournament-schedules')
  createSchedule(@Body() body: any) { return this.tournSvc.createSchedule(body); }

  @Post('tournament-schedules/:id')
  updateSchedule(@Param('id') id: string, @Body() body: any) {
    return this.tournSvc.updateSchedule(id, body);
  }

  @Post('tournament-schedules/:id/delete')
  deleteSchedule(@Param('id') id: string) {
    return this.tournSvc.deleteSchedule(id);
  }
}
