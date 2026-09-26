import { Module } from '@nestjs/common';
import { StorefrontWishlistController } from './storefront-wishlist.controller';
import { StorefrontWishlistService } from './storefront-wishlist.service';

@Module({
  controllers: [StorefrontWishlistController],
  providers: [StorefrontWishlistService],
  exports: [StorefrontWishlistService],
})
export class StorefrontWishlistModule {}
