import { Module } from '@nestjs/common';
import { StorefrontCatalogController } from './storefront-catalog.controller';
import { StorefrontCatalogService } from './storefront-catalog.service';

@Module({
  controllers: [StorefrontCatalogController],
  providers: [StorefrontCatalogService],
  exports: [StorefrontCatalogService],
})
export class StorefrontCatalogModule {}
