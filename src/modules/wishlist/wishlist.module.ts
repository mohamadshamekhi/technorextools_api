import { Global, Module } from '@nestjs/common';
import { WishlistRepository } from './repositories/wishlist.repository';

/** Wishlist domain core — the `wishlists` repository (customer-owned). */
@Global()
@Module({
  providers: [WishlistRepository],
  exports: [WishlistRepository],
})
export class WishlistModule {}
