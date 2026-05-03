import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bet } from './bet.entity';
import { User } from '../users/user.entity';
import { BetsService } from './bets.service';
import { BetsController } from './bets.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bet, User]), AuthModule],
  providers: [BetsService],
  controllers: [BetsController],
  exports: [BetsService],
})
export class BetsModule {}
