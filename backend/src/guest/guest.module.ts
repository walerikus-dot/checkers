import { Module } from '@nestjs/common';
import { GuestGateway } from './guest.gateway';

@Module({
  providers: [GuestGateway],
})
export class GuestModule {}
