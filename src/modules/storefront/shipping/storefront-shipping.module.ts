import { Module } from '@nestjs/common';
import { StorefrontShippingController } from './storefront-shipping.controller';
import { StorefrontShippingService } from './storefront-shipping.service';

@Module({
  controllers: [StorefrontShippingController],
  providers: [StorefrontShippingService],
  exports: [StorefrontShippingService],
})
export class StorefrontShippingModule {}
