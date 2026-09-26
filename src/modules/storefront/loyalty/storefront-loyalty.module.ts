import { Module } from '@nestjs/common';
import { StorefrontLoyaltyController } from './storefront-loyalty.controller';
import { StorefrontLoyaltyService } from './storefront-loyalty.service';

@Module({
  controllers: [StorefrontLoyaltyController],
  providers: [StorefrontLoyaltyService],
})
export class StorefrontLoyaltyModule {}
