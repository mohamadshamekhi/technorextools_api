import { Module } from '@nestjs/common';
import { StorefrontSparePartsController } from './storefront-spare-parts.controller';
import { StorefrontSparePartsService } from './storefront-spare-parts.service';

@Module({
  controllers: [StorefrontSparePartsController],
  providers: [StorefrontSparePartsService],
})
export class StorefrontSparePartsModule {}
