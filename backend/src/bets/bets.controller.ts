import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { BetsService } from './bets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * Authenticated bet endpoints.
 *
 * The relay (guest gateway) calls these via the service directly when authenticated
 * sockets create / join bet rooms. This controller exposes the same operations over
 * REST for testing, manual settlement, and the admin panel.
 */
@Controller('bets')
@UseGuards(JwtAuthGuard)
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post('escrow')
  @HttpCode(200)
  async escrow(@Request() req, @Body() body: { amount: number; roomId?: string }) {
    const bet = await this.bets.escrow(req.user.id, body.amount, body.roomId ?? null);
    return { id: bet.id, amount: bet.amount, status: bet.status, expiresAt: bet.expiresAt };
  }

  @Post(':betId/refund')
  @HttpCode(200)
  async refundOwn(@Request() req, @Param('betId', ParseUUIDPipe) betId: string) {
    const bet = await this.bets.refund(betId, req.user.id);
    return { id: bet.id, status: bet.status, payout: bet.payout };
  }

  @Get(':betId')
  async findOne(@Request() req, @Param('betId', ParseUUIDPipe) betId: string) {
    return this.bets.findOne(betId, req.user.id);
  }

  @Get()
  async listMine(@Request() req) {
    return this.bets.listMine(req.user.id);
  }
}
