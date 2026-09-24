import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProductRepository } from '../../catalog/repositories/product.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import {
  SparePartRepository,
  type SparePartDetailRow,
} from '../../spare-parts/repositories/spare-part.repository';
import { toSparePartView, type SparePartView } from '../../spare-parts/spare-part.view';
import type { StorefrontListSparePartsQuery } from './storefront-spare-parts.schemas';

export type StorefrontSparePartView = SparePartView;

@Injectable()
export class StorefrontSparePartsService {
  constructor(
    private readonly spareParts: SparePartRepository,
    private readonly products: ProductRepository,
    private readonly media: MediaRepository,
  ) {}

  async list(query: StorefrontListSparePartsQuery) {
    let productId: string | undefined;
    if (query.productSlug) {
      const product = await this.products.findBySlug(query.productSlug);
      if (!product || !product.isActive || product.deletedAt !== null) {
        throw new NotFoundException('محصول یافت نشد');
      }
      productId = product.id;
    }
    const where: Prisma.SparePartWhereInput = {
      isActive: true,
      ...(query.inStock ? { stockQty: { gt: 0 } } : {}),
      ...(productId ? { compatibleProducts: { some: { productId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { partNumber: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.spareParts.paginate(where, query.skip, query.take);
    return { items: await this.toViews(rows), total, skip: query.skip, take: query.take };
  }

  async detail(slug: string): Promise<StorefrontSparePartView> {
    const row = await this.spareParts.findBySlug(slug);
    if (!row || !row.isActive) throw new NotFoundException('قطعه یدکی یافت نشد');
    return (await this.toViews([row]))[0]!;
  }

  private async toViews(rows: SparePartDetailRow[]): Promise<StorefrontSparePartView[]> {
    const media = await this.media.findByOwners(
      'SPARE_PART',
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      toSparePartView(
        r,
        media.filter((m) => m.ownerId === r.id),
        true,
      ),
    );
  }
}
