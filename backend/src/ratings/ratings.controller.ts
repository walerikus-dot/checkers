import { Controller, Get, Param, Query } from '@nestjs/common';
import { RatingsService } from './ratings.service';

@Controller('ratings')
export class RatingsController {
  constructor(private ratingsService: RatingsService) {}

  @Get('leaderboard')
  leaderboard(@Query('limit') limit = 50) {
    return this.ratingsService.getLeaderboard(+limit);
  }

  @Get(':userId')
  getOne(@Param('userId') userId: string) {
    return this.ratingsService.getOrCreate(userId);
  }
}
