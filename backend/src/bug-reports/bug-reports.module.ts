import { Module } from '@nestjs/common';
import { BugReportsController } from './bug-reports.controller';

@Module({
  controllers: [BugReportsController],
})
export class BugReportsModule {}
