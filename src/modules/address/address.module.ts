import { Global, Module } from '@nestjs/common';
import { AddressRepository } from './repositories/address.repository';

/**
 * Address domain core — the `addresses` repository, shared by the storefront
 * customer panel and the checkout flow (order ships to an address).
 */
@Global()
@Module({
  providers: [AddressRepository],
  exports: [AddressRepository],
})
export class AddressModule {}
