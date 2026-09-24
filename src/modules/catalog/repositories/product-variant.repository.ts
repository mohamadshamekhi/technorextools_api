import { Injectable } from '@nestjs/common';
import type { PriceTier, ProductVariant, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type VariantWithProduct = ProductVariant & {
  product: Prisma.ProductGetPayload<{
    select: { id: true; title: true; slug: true; basePrice: true };
  }>;
};

const variantForCartInclude = {
  product: {
    select: {
      id: true,
      title: true,
      slug: true,
      basePrice: true,
      isActive: true,
      deletedAt: true,
    },
  },
  priceTiers: { orderBy: { minQty: 'asc' } },
} satisfies Prisma.ProductVariantInclude;
export type VariantForCart = Prisma.ProductVariantGetPayload<{
  include: typeof variantForCartInclude;
}>;

/**
 * All Prisma access for the `product_variants` collection. The `price_tiers`
 * child rows are managed here as part of the variant aggregate.
 */
@Injectable()
export class ProductVariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({ where: { id } });
  }

  /** Active variants at or below a stock threshold — the low-stock report. */
  lowStock(threshold: number, skip: number, take: number): Promise<[VariantWithProduct[], number]> {
    const where: Prisma.ProductVariantWhereInput = {
      isActive: true,
      stockQty: { lte: threshold },
    };
    return Promise.all([
      this.prisma.productVariant.findMany({
        where,
        orderBy: { stockQty: 'asc' },
        skip,
        take,
        include: { product: { select: { id: true, title: true, slug: true, basePrice: true } } },
      }),
      this.prisma.productVariant.count({ where }),
    ]);
  }

  findByIdWithProduct(id: string): Promise<VariantWithProduct | null> {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: { select: { id: true, title: true, slug: true, basePrice: true } } },
    });
  }

  findByIdForCart(id: string): Promise<VariantForCart | null> {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: variantForCartInclude,
    });
  }

  findBySku(sku: string): Promise<ProductVariant | null> {
    return this.prisma.productVariant.findUnique({ where: { sku } });
  }

  findManyByProductId(productId: string): Promise<ProductVariant[]> {
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
      include: { priceTiers: { orderBy: { minQty: 'asc' } } },
    });
  }

  findByIdWithPriceTiers(
    id: string,
  ): Promise<(ProductVariant & { priceTiers: PriceTier[] }) | null> {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: { priceTiers: { orderBy: { minQty: 'asc' } } },
    });
  }

  /** Active variants of a product set, oldest first — storefront cards read the first per product. */
  findActiveByProductIds(productIds: string[]): Promise<ProductVariant[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.prisma.productVariant.findMany({
      where: { productId: { in: productIds }, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Variants of a product set — used by bulk price update (only `priceOverride` matters). */
  findManyByProductIds(productIds: string[]): Promise<ProductVariant[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.prisma.productVariant.findMany({ where: { productId: { in: productIds } } });
  }

  /** Apply a computed `priceOverride` per variant in one transaction (bulk price update). */
  async bulkUpdatePriceOverrides(
    updates: Array<{ id: string; priceOverride: number }>,
  ): Promise<void> {
    if (updates.length === 0) return;
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.productVariant.update({
          where: { id: u.id },
          data: { priceOverride: u.priceOverride },
        }),
      ),
    );
  }

  create(data: Prisma.ProductVariantCreateInput): Promise<ProductVariant> {
    return this.prisma.productVariant.create({ data });
  }

  update(id: string, data: Prisma.ProductVariantUpdateInput): Promise<ProductVariant> {
    return this.prisma.productVariant.update({ where: { id }, data });
  }

  /** Apply a stock delta (negative = sale, positive = restock on cancel/refund). */
  adjustStock(id: string, delta: number): Promise<ProductVariant> {
    return this.prisma.productVariant.update({
      where: { id },
      data: { stockQty: { increment: delta } },
    });
  }

  /** Replace the whole price-tier ladder of a variant in one transaction. */
  async replacePriceTiers(
    variantId: string,
    tiers: Array<{ minQty: number; unitPrice: number }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.priceTier.deleteMany({ where: { variantId } }),
      ...(tiers.length
        ? [this.prisma.priceTier.createMany({ data: tiers.map((t) => ({ variantId, ...t })) })]
        : []),
    ]);
  }

  async paginate(
    where: Prisma.ProductVariantWhereInput,
    skip: number,
    take: number,
  ): Promise<{ items: VariantWithProduct[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: { product: { select: { id: true, title: true, slug: true, basePrice: true } } },
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return { items, total };
  }
}
