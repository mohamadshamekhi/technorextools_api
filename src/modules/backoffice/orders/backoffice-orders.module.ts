import { Module } from '@nestjs/common';
import { BackofficeOrdersController } from './backoffice-orders.controller';
import { BackofficeOrdersService } from './backoffice-orders.service';
import { BackofficePaymentsController } from './backoffice-payments.controller';

@Module({
  controllers: [BackofficeOrdersController, BackofficePaymentsController],
  providers: [BackofficeOrdersService],
})
export class BackofficeOrdersModule {}
