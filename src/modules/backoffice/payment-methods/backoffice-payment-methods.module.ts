import { Module } from '@nestjs/common';
import { BackofficePaymentMethodsController } from './backoffice-payment-methods.controller';
import { BackofficePaymentMethodsService } from './backoffice-payment-methods.service';

@Module({
  controllers: [BackofficePaymentMethodsController],
  providers: [BackofficePaymentMethodsService],
})
export class BackofficePaymentMethodsModule {}
