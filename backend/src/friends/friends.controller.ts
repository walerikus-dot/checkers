import { Controller, Post, Delete, Get, Param, UseGuards, Request } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  @Get() getFriends(@Request() req) { return this.friendsService.getFriends(req.user.id); }
  @Get('requests') getRequests(@Request() req) { return this.friendsService.getRequests(req.user.id); }
  @Post('request/:userId') sendRequest(@Param('userId') userId: string, @Request() req) { return this.friendsService.sendRequest(req.user.id, userId); }
  @Post(':requestId/accept') accept(@Param('requestId') id: string, @Request() req) { return this.friendsService.accept(id, req.user.id); }
  @Delete(':userId') remove(@Param('userId') userId: string, @Request() req) { return this.friendsService.remove(req.user.id, userId); }
}
