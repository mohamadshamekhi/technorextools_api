import { Global, Module } from '@nestjs/common';
import { AbandonedCartLogRepository } from './repositories/abandoned-cart-log.repository';
import { CartRepository } from './repositories/cart.repository';

/**
 * Cart domain core — the `CartRepository` is shared by the storefront cart
 * module and (later) the checkout/order module. Follows the CatalogModule
 * pattern: a @Global module so consumers inject the repository without an
 * explicit import.
 */
@Global()
@Module({
  providers: [CartRepository, AbandonedCartLogRepository],
  exports: [CartRepository, AbandonedCartLogRepository],
})
export class CartModule {}
