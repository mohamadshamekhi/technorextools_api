import { Module } from '@nestjs/common';
import { BackofficeReportsController } from './backoffice-reports.controller';
import { BackofficeReportsService } from './backoffice-reports.service';

@Module({
  controllers: [BackofficeReportsController],
  providers: [BackofficeReportsService],
})
export class BackofficeReportsModule {}
