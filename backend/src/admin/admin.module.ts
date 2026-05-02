import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../users/user.entity';
import { Rating } from '../ratings/rating.entity';
import { Game } from '../games/game.entity';
import { Tournament } from '../tournaments/tournament.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Rating, Game, Tournament]),
    TournamentsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
