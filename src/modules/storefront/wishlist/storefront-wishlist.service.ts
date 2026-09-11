import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { WishlistRepository } from '../../wishlist/repositories/wishlist.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { mainImageUrlOf } from '../../media/media.gallery';

export interface WishlistItemView {
  productId: string;
  title: string;
  slug: string;
  basePrice: number;
  brand: { title: string; slug: string } | null;
  mainImageUrl: string | null;
  addedAt: Date;
}

@Injectable()
export class StorefrontWishlistService {
  constructor(
    private readonly wishlist: WishlistRepository,
    private readonly products: ProductRepository,
    private readonly media: MediaRepository,
  ) {}

  async list(userId: string): Promise<WishlistItemView[]> {
    const rows = await this.wishlist.findByUser(userId);
    const mediaRows = await this.media.findByOwners(
      'PRODUCT',
      rows.map((r) => r.productId),
    );
    return rows.map((r) => ({
      productId: r.productId,
      title: r.product.title,
      slug: r.product.slug,
      basePrice: r.product.basePrice,
      brand: r.product.brand
        ? { title: r.product.brand.title, slug: r.product.brand.slug }
        : null,
      mainImageUrl: mainImageUrlOf(mediaRows.filter((m) => m.ownerId === r.productId)),
      addedAt: r.createdAt,
    }));
  }

  async add(userId: string, productId: string): Promise<{ ok: true }> {
    const product = await this.products.findById(productId);
    if (!product || !product.isActive || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد');
    }
    await this.wishlist.add(userId, productId);
    return { ok: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.wishlist.remove(userId, productId);
  }
}
