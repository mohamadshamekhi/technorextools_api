import { Module } from '@nestjs/common';
import { BackofficeAccountingController } from './backoffice-accounting.controller';
import { BackofficeAccountingService } from './backoffice-accounting.service';

@Module({
  controllers: [BackofficeAccountingController],
  providers: [BackofficeAccountingService],
})
export class BackofficeAccountingModule {}
