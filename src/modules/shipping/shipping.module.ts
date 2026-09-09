import { Global, Module } from '@nestjs/common';
import { ShippingMethodRepository } from './repositories/shipping-method.repository';

/**
 * Shipping domain core — the `shipping_methods` repository, shared by the
 * storefront (public list + checkout cost) and backoffice (CRUD, later).
 */
@Global()
@Module({
  providers: [ShippingMethodRepository],
  exports: [ShippingMethodRepository],
})
export class ShippingModule {}
