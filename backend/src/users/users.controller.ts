import { Controller, Get, Put, Delete, Param, Body, Query, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Project a user row to only the public fields safe to expose on unauthenticated endpoints.
  // Hides passwordHash, email, oauthId, oauthProvider, language, phone, pendingEmail, etc.
  private _publicProfile(u: any) {
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl || null,
      country: u.country || null,
      countryCode: u.countryCode || null,
      isOnline: !!u.isOnline,
      totalGames: u.totalGames || 0,
      totalWins: u.totalWins || 0,
      rating: u.rating ? {
        rating: Math.round(u.rating.rating),
        rd: Math.round(u.rating.rd),
        gamesPlayed: u.rating.gamesPlayed || 0,
        wins: u.rating.wins || 0,
        losses: u.rating.losses || 0,
        draws: u.rating.draws || 0,
      } : null,
    };
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('sort') sort = 'rating',
  ) {
    const allowed = ['rating', 'winrate', 'wins', 'games'] as const;
    const sortBy = (allowed as readonly string[]).includes(sort) ? (sort as any) : 'rating';
    const rows = await this.usersService.getLeaderboard(+limit, +offset, sortBy);
    return rows.map(u => this._publicProfile(u));
  }

  @Get('search')
  async search(@Query('q') q: string) {
    const rows = await this.usersService.search(q);
    return rows.map(u => this._publicProfile(u));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const u = await this.usersService.findById(id);
    return this._publicProfile(u);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() body: { username?: string; avatarUrl?: string; country?: string; countryCode?: string; phone?: string; language?: string }, @Request() req) {
    if (req.user.id !== id) throw new ForbiddenException('Cannot update another user');
    const patch: any = {};
    if (typeof body.username    === 'string') patch.username    = body.username;
    if (typeof body.avatarUrl   === 'string') patch.avatarUrl   = body.avatarUrl;
    if ('country'     in body) patch.country     = body.country     || null;
    if ('countryCode' in body) patch.countryCode = (body.countryCode || '').toUpperCase().slice(0,2) || null;
    if ('phone'       in body) patch.phone       = (body.phone || '').trim().slice(0, 32) || null;
    if ('language'    in body) {
      const lng = (body.language || '').toLowerCase().slice(0, 5);
      patch.language = (lng === 'en' || lng === 'ru') ? lng : null;
    }
    return this.usersService.update(id, patch);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @Body() body: { currentPassword?: string } = {}, @Request() req) {
    if (req.user.id !== id) throw new ForbiddenException('Cannot delete another user');
    // Require current password if the account has one set (skip for OAuth-only users)
    const user = await this.usersService.findById(id);
    if (user.passwordHash) {
      if (!body?.currentPassword) throw new BadRequestException('Current password is required to delete this account');
      const ok = await this.usersService.verifyPassword(user, body.currentPassword);
      if (!ok) throw new BadRequestException('Current password is incorrect');
    }
    await this.usersService.remove(id);
    return { deleted: true };
  }

  /* ── Progression sync ────────────────────── */

  @Get(':id/progress')
  @UseGuards(JwtAuthGuard)
  async getProgress(@Param('id') id: string, @Request() req) {
    if (req.user.id !== id) throw new ForbiddenException('Cannot read another user\'s progress');
    const user = await this.usersService.findById(id);
    return {
      xp: user.xp,
      credits: user.credits,
      streak: user.streak,
      totalWins: user.totalWins,
      totalGames: user.totalGames,
      firstWinBonus: user.firstWinBonus,
    };
  }

  @Put(':id/progress')
  @UseGuards(JwtAuthGuard)
  async syncProgress(
    @Param('id') id: string,
    // NOTE: `credits` is intentionally NOT in this signature. Credits are managed exclusively
    // by the bet-escrow flow (BetsService) — accepting client-supplied credits would let a
    // tampered client inflate its balance. See Phase 5 of the bet-escrow upgrade.
    @Body() body: { xp?: number; streak?: number; totalWins?: number; totalGames?: number; firstWinBonus?: boolean },
    @Request() req,
  ) {
    if (req.user.id !== id) throw new ForbiddenException('Cannot update another user\'s progress');
    const user = await this.usersService.findById(id);

    // Merge: take the higher value for cumulative fields. Credits are NOT updated here.
    const merged: any = {};
    if (body.xp !== undefined) merged.xp = Math.max(user.xp || 0, body.xp);
    if (body.streak !== undefined) merged.streak = body.streak; // current streak, not cumulative
    if (body.totalWins !== undefined) merged.totalWins = Math.max(user.totalWins || 0, body.totalWins);
    if (body.totalGames !== undefined) merged.totalGames = Math.max(user.totalGames || 0, body.totalGames);
    if (body.firstWinBonus !== undefined) merged.firstWinBonus = user.firstWinBonus || body.firstWinBonus;

    if (Object.keys(merged).length > 0) await this.usersService.update(id, merged);

    return {
      xp: merged.xp ?? user.xp,
      credits: user.credits, // always echo the server's authoritative value
      streak: merged.streak ?? user.streak,
      totalWins: merged.totalWins ?? user.totalWins,
      totalGames: merged.totalGames ?? user.totalGames,
      firstWinBonus: merged.firstWinBonus ?? user.firstWinBonus,
    };
  }
}
