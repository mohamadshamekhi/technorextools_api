import { Injectable } from '@nestjs/common';
import type { Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const brandStub = { select: { id: true, title: true, slug: true } };
const categoryStub = { select: { id: true, title: true, slug: true } };

// Product images/datasheets/3D models are `Media` rows (polymorphic owner) — the
// consuming services stitch them in via `MediaRepository`, not a Prisma include.

/** List/detail card row: brand + category stub. */
const productListInclude = {
  brand: brandStub,
  category: categoryStub,
} satisfies Prisma.ProductInclude;
export type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;

/** Full aggregate row for the admin detail view. */
const productFullInclude = {
  brand: brandStub,
  category: categoryStub,
  variants: { orderBy: { createdAt: 'asc' } },
  attributeValues: { include: { attribute: true } },
  relatedTo: {
    include: {
      related: { include: { brand: brandStub } },
    },
  },
} satisfies Prisma.ProductInclude;
export type ProductFullRow = Prisma.ProductGetPayload<{ include: typeof productFullInclude }>;

/** Storefront variant of the full row — only active variants, richer brand. */
const storefrontProductInclude = {
  brand: {
    select: {
      id: true,
      title: true,
      slug: true,
      isExclusiveDistributor: true,
      authenticityNote: true,
    },
  },
  category: categoryStub,
  variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
  attributeValues: { include: { attribute: true } },
  relatedTo: {
    include: {
      // active/not-deleted filtering happens in the service — Prisma (Mongo) does
      // not accept `where` on a to-one relation include.
      related: { include: { brand: brandStub } },
    },
  },
} satisfies Prisma.ProductInclude;
export type StorefrontProductRow = Prisma.ProductGetPayload<{
  include: typeof storefrontProductInclude;
}>;

type BrandStub = Prisma.BrandGetPayload<{ select: { id: true; title: true; slug: true } }>;

/**
 * All Prisma access for the `products` collection. The `product_attribute_values`
 * and `related_products` child rows are managed here as part of the product
 * aggregate — they never get repositories of their own. Product images live in
 * the `media` collection (see `MediaRepository`).
 */
@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  findByIdFull(id: string): Promise<ProductFullRow | null> {
    return this.prisma.product.findUnique({ where: { id }, include: productFullInclude });
  }

  findBySlug(slug: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { slug } });
  }

  findBySlugForStorefront(slug: string): Promise<StorefrontProductRow | null> {
    return this.prisma.product.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      include: storefrontProductInclude,
    });
  }

  findManyByIds(ids: string[]): Promise<ProductListRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.product.findMany({
      where: { id: { in: ids }, isActive: true, deletedAt: null },
      include: productListInclude,
    });
  }

  create(data: Prisma.ProductCreateInput): Promise<Product> {
    // `deletedAt` has no @default — on Mongo an unset field is *absent*, not `null`,
    // and Prisma's `{ deletedAt: null }` filter (used everywhere to exclude soft-deleted
    // rows) does not match an absent field. Write it explicitly so every product is
    // findable by every list/detail query from the moment it's created.
    return this.prisma.product.create({ data: { deletedAt: null, ...data } });
  }

  update(id: string, data: Prisma.ProductUpdateInput): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Row set for bulk price update — id + current price only. */
  findManyByFilter(
    where: Prisma.ProductWhereInput,
  ): Promise<Array<Pick<Product, 'id' | 'basePrice'>>> {
    return this.prisma.product.findMany({ where, select: { id: true, basePrice: true } });
  }

  /** Apply a computed `basePrice` per product in one transaction (bulk price update). */
  async bulkUpdateBasePrices(updates: Array<{ id: string; basePrice: number }>): Promise<void> {
    if (updates.length === 0) return;
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.product.update({ where: { id: u.id }, data: { basePrice: u.basePrice } }),
      ),
    );
  }

  countByBrandId(brandId: string): Promise<number> {
    return this.prisma.product.count({ where: { brandId } });
  }

  /** Existence check for a set of ids regardless of status — used by related-product validation. */
  countByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return Promise.resolve(0);
    return this.prisma.product.count({ where: { id: { in: ids } } });
  }

  /** Replace the whole attribute-value set of a product in one transaction. */
  async replaceAttributeValues(
    productId: string,
    values: Array<{ attributeId: string; value: string }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productAttributeValue.deleteMany({ where: { productId } }),
      this.prisma.productAttributeValue.createMany({
        data: values.map((v) => ({ productId, attributeId: v.attributeId, value: v.value })),
      }),
    ]);
  }

  /** Replace the whole related-product set of a product in one transaction. */
  async replaceRelated(productId: string, relatedProductIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.relatedProduct.deleteMany({ where: { productId } }),
      ...(relatedProductIds.length
        ? [
            this.prisma.relatedProduct.createMany({
              data: relatedProductIds.map((relatedProductId) => ({ productId, relatedProductId })),
            }),
          ]
        : []),
    ]);
  }

  async paginate(
    where: Prisma.ProductWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' },
  ): Promise<{ items: ProductListRow[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: productListInclude,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total };
  }
}

export type { BrandStub };
