import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get()
  getByGame(@Query('gameId') gameId: string, @Query('limit') limit = 50) {
    return this.messagesService.getByGame(gameId, +limit);
  }
}
