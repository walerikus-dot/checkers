import { Controller, Post, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('games/quick-play')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(private matchmakingService: MatchmakingService) {}

  @Post()
  join(@Body() body: { rating?: number; rulesType?: any }, @Request() req) {
    return this.matchmakingService.joinQueue(req.user.id, body.rating || 1500, body.rulesType);
  }

  @Delete()
  leave(@Request() req) {
    return this.matchmakingService.leaveQueue(req.user.id);
  }
}
