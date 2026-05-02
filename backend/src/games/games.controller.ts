import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { GamesService } from './games.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RulesType } from './game.entity';
import { IsIn, IsString, IsUUID } from 'class-validator';

class GuestResultDto {
  @IsUUID() opponentId: string;
  @IsIn(['win', 'loss']) result: 'win' | 'loss';
  @IsIn(['russian', 'english', 'international']) rulesType: RulesType;
  @IsString() roomId: string;
}

@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Post('guest-result')
  async guestResult(@Body() dto: GuestResultDto, @Request() req) {
    if (req.user.id === dto.opponentId) throw new BadRequestException('Cannot record a game against yourself');
    await this.gamesService.recordGuestResult(req.user.id, dto.opponentId, dto.result, dto.rulesType, dto.roomId);
    return { ok: true };
  }

  @Post('private')
  createPrivate(@Body() body: { rulesType?: RulesType }, @Request() req) {
    return this.gamesService.createGame(req.user.id, null, body.rulesType, true);
  }

  @Get('history')
  history(@Query('userId') userId: string, @Query('limit') limit = 20, @Request() req) {
    return this.gamesService.getHistory(userId || req.user.id, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gamesService.getGame(id);
  }

  @Get(':id/moves')
  getMoves(@Param('id') id: string) {
    return this.gamesService.getGame(id).then(g => g.moves);
  }

  @Post(':id/move')
  submitMove(@Param('id') id: string, @Body() body: { from: string; to: string }, @Request() req) {
    return this.gamesService.submitMove(id, req.user.id, body.from, body.to);
  }

  @Delete(':id')
  resign(@Param('id') id: string, @Request() req) {
    return this.gamesService.resign(id, req.user.id);
  }
}
