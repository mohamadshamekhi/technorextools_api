import { Module } from '@nestjs/common';
import { StorefrontContentController } from './storefront-content.controller';
import { StorefrontContentService } from './storefront-content.service';

@Module({
  controllers: [StorefrontContentController],
  providers: [StorefrontContentService],
  exports: [StorefrontContentService],
})
export class StorefrontContentModule {}
