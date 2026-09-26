import { Module } from '@nestjs/common';
import { StorefrontCheckoutController } from './storefront-checkout.controller';
import { StorefrontCheckoutService } from './storefront-checkout.service';

@Module({
  controllers: [StorefrontCheckoutController],
  providers: [StorefrontCheckoutService],
})
export class StorefrontCheckoutModule {}
