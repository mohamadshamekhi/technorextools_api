import { Injectable } from '@nestjs/common';
import type { Prisma, SparePart } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const detailInclude = {
  compatibleProducts: {
    include: {
      product: { select: { id: true, title: true, slug: true, isActive: true, deletedAt: true } },
    },
  },
} satisfies Prisma.SparePartInclude;

export type SparePartDetailRow = Prisma.SparePartGetPayload<{ include: typeof detailInclude }>;

/**
 * All Prisma access for the `spare_parts` collection. `SparePartCompatibility`
 * junction rows are managed here as part of the aggregate (convention 5).
 */
@Injectable()
export class SparePartRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<SparePartDetailRow | null> {
    return this.prisma.sparePart.findFirst({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  findBySlug(slug: string): Promise<SparePartDetailRow | null> {
    return this.prisma.sparePart.findFirst({
      where: { slug, deletedAt: null },
      include: detailInclude,
    });
  }

  /** Includes soft-deleted rows — slug/partNumber uniqueness is DB-wide. */
  findAnyBySlug(slug: string): Promise<SparePart | null> {
    return this.prisma.sparePart.findUnique({ where: { slug } });
  }

  findAnyByPartNumber(partNumber: string): Promise<SparePart | null> {
    return this.prisma.sparePart.findUnique({ where: { partNumber } });
  }

  paginate(
    where: Prisma.SparePartWhereInput,
    skip: number,
    take: number,
  ): Promise<[SparePartDetailRow[], number]> {
    const scoped: Prisma.SparePartWhereInput = { ...where, deletedAt: null };
    return Promise.all([
      this.prisma.sparePart.findMany({
        where: scoped,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: detailInclude,
      }),
      this.prisma.sparePart.count({ where: scoped }),
    ]);
  }

  async create(
    data: Prisma.SparePartCreateInput,
    productIds: string[],
  ): Promise<SparePartDetailRow> {
    // Mongo: an unset `deletedAt` is absent, not null — `{ deletedAt: null }` filters wouldn't match.
    const created = await this.prisma.sparePart.create({ data: { deletedAt: null, ...data } });
    if (productIds.length > 0) {
      await this.prisma.sparePartCompatibility.createMany({
        data: productIds.map((productId) => ({ sparePartId: created.id, productId })),
      });
    }
    return this.findById(created.id) as Promise<SparePartDetailRow>;
  }

  async update(
    id: string,
    data: Prisma.SparePartUpdateInput,
    productIds?: string[],
  ): Promise<SparePartDetailRow> {
    await this.prisma.sparePart.update({ where: { id }, data });
    if (productIds) await this.replaceCompatibleProducts(id, productIds);
    return this.findById(id) as Promise<SparePartDetailRow>;
  }

  softDelete(id: string): Promise<SparePart> {
    return this.prisma.sparePart.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** Stock delta (negative = sale, positive = restock on cancel). */
  adjustStock(id: string, delta: number): Promise<SparePart> {
    return this.prisma.sparePart.update({
      where: { id },
      data: { stockQty: { increment: delta } },
    });
  }

  // ── compatibility (junction) ────────────────────────────────────────────────

  /** Replace the whole set of products a spare part fits. */
  async replaceCompatibleProducts(sparePartId: string, productIds: string[]): Promise<void> {
    await this.prisma.sparePartCompatibility.deleteMany({ where: { sparePartId } });
    if (productIds.length > 0) {
      await this.prisma.sparePartCompatibility.createMany({
        data: productIds.map((productId) => ({ sparePartId, productId })),
      });
    }
  }

  /** Replace the whole set of spare parts declared for a product. */
  async replaceForProduct(productId: string, sparePartIds: string[]): Promise<void> {
    await this.prisma.sparePartCompatibility.deleteMany({ where: { productId } });
    if (sparePartIds.length > 0) {
      await this.prisma.sparePartCompatibility.createMany({
        data: sparePartIds.map((sparePartId) => ({ sparePartId, productId })),
      });
    }
  }

  /** Live (non-deleted) spare parts compatible with a product. */
  findByProductId(productId: string, onlyActive: boolean): Promise<SparePartDetailRow[]> {
    return this.prisma.sparePart.findMany({
      where: {
        deletedAt: null,
        ...(onlyActive ? { isActive: true } : {}),
        compatibleProducts: { some: { productId } },
      },
      orderBy: { title: 'asc' },
      include: detailInclude,
    });
  }

  countByIds(ids: string[]): Promise<number> {
    return this.prisma.sparePart.count({ where: { id: { in: ids }, deletedAt: null } });
  }
}
