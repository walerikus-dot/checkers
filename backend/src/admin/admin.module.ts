import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../users/user.entity';
import { Rating } from '../ratings/rating.entity';
import { Game } from '../games/game.entity';
import { Tournament } from '../tournaments/tournament.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { Bet } from '../bets/bet.entity';
import { BetsModule } from '../bets/bets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Rating, Game, Tournament, Bet]),
    TournamentsModule,
    BetsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
