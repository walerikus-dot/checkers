import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingController } from './matchmaking.controller';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [GamesModule],
  providers: [MatchmakingService],
  controllers: [MatchmakingController],
})
export class MatchmakingModule {}
