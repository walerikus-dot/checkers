import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { GameGateway } from './game.gateway';
import { Game } from './game.entity';
import { Move } from '../moves/move.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Game, Move]), AuthModule, UsersModule, RatingsModule],
  providers: [GamesService, GameGateway],
  controllers: [GamesController],
  exports: [GamesService],
})
export class GamesModule {}
