import { Module } from '@nestjs/common';
import { StorefrontDiscountsController } from './storefront-discounts.controller';
import { StorefrontDiscountsService } from './storefront-discounts.service';

@Module({
  controllers: [StorefrontDiscountsController],
  providers: [StorefrontDiscountsService],
})
export class StorefrontDiscountsModule {}
