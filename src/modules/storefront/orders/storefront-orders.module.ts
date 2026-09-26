import { Module } from '@nestjs/common';
import { StorefrontOrdersController } from './storefront-orders.controller';
import { StorefrontOrdersService } from './storefront-orders.service';

@Module({
  controllers: [StorefrontOrdersController],
  providers: [StorefrontOrdersService],
})
export class StorefrontOrdersModule {}
