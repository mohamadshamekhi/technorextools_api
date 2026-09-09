import { Module } from '@nestjs/common';
import { StorefrontWarrantyController } from './storefront-warranty.controller';
import { StorefrontWarrantyService } from './storefront-warranty.service';

@Module({
  controllers: [StorefrontWarrantyController],
  providers: [StorefrontWarrantyService],
  exports: [StorefrontWarrantyService],
})
export class StorefrontWarrantyModule {}
