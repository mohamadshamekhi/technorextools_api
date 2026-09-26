import { Module } from '@nestjs/common';
import { StorefrontAddressesController } from './storefront-addresses.controller';
import { StorefrontAddressesService } from './storefront-addresses.service';

@Module({
  controllers: [StorefrontAddressesController],
  providers: [StorefrontAddressesService],
  exports: [StorefrontAddressesService],
})
export class StorefrontAddressesModule {}
