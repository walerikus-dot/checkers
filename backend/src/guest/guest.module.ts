import { Module } from '@nestjs/common';
import { GuestGateway } from './guest.gateway';
import { AuthModule } from '../auth/auth.module';
import { BetsModule } from '../bets/bets.module';

@Module({
  imports: [AuthModule, BetsModule],
  providers: [GuestGateway],
})
export class GuestModule {}
