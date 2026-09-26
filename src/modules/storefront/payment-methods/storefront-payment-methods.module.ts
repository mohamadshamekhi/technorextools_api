import { Module } from '@nestjs/common';
import { StorefrontPaymentMethodsController } from './storefront-payment-methods.controller';
import { StorefrontPaymentMethodsService } from './storefront-payment-methods.service';

@Module({
  controllers: [StorefrontPaymentMethodsController],
  providers: [StorefrontPaymentMethodsService],
  exports: [StorefrontPaymentMethodsService],
})
export class StorefrontPaymentMethodsModule {}
