import { Module } from '@nestjs/common';
import { GuestGateway } from './guest.gateway';
import { BugReportController } from './bug-report.controller';

@Module({
  controllers: [BugReportController],
  providers: [GuestGateway],
})
export class GuestAppModule {}
