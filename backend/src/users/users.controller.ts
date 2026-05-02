import { Controller, Get, Put, Delete, Param, Body, Query, UseGuards, Request, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit = 50, @Query('offset') offset = 0) {
    return this.usersService.getLeaderboard(+limit, +offset);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.usersService.search(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
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
    @Body() body: { xp?: number; credits?: number; streak?: number; totalWins?: number; totalGames?: number; firstWinBonus?: boolean },
    @Request() req,
  ) {
    if (req.user.id !== id) throw new ForbiddenException('Cannot update another user\'s progress');
    const user = await this.usersService.findById(id);

    // Merge: take the higher value for cumulative fields
    const merged: any = {};
    if (body.xp !== undefined) merged.xp = Math.max(user.xp || 0, body.xp);
    if (body.credits !== undefined) merged.credits = Math.max(user.credits || 0, body.credits);
    if (body.streak !== undefined) merged.streak = body.streak; // current streak, not cumulative
    if (body.totalWins !== undefined) merged.totalWins = Math.max(user.totalWins || 0, body.totalWins);
    if (body.totalGames !== undefined) merged.totalGames = Math.max(user.totalGames || 0, body.totalGames);
    if (body.firstWinBonus !== undefined) merged.firstWinBonus = user.firstWinBonus || body.firstWinBonus;

    await this.usersService.update(id, merged);

    return {
      xp: merged.xp ?? user.xp,
      credits: merged.credits ?? user.credits,
      streak: merged.streak ?? user.streak,
      totalWins: merged.totalWins ?? user.totalWins,
      totalGames: merged.totalGames ?? user.totalGames,
      firstWinBonus: merged.firstWinBonus ?? user.firstWinBonus,
    };
  }
}
