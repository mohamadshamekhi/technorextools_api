import { Module } from '@nestjs/common';
import { StorefrontCartController } from './storefront-cart.controller';
import { StorefrontCartService } from './storefront-cart.service';

@Module({
  controllers: [StorefrontCartController],
  providers: [StorefrontCartService],
  exports: [StorefrontCartService],
})
export class StorefrontCartModule {}
