import { Module } from '@nestjs/common';
import { StorefrontRepairsController } from './storefront-repairs.controller';
import { StorefrontRepairsService } from './storefront-repairs.service';

@Module({
  controllers: [StorefrontRepairsController],
  providers: [StorefrontRepairsService],
})
export class StorefrontRepairsModule {}
