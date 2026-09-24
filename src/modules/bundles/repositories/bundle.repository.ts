import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const detailInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: { select: { id: true, title: true, slug: true, basePrice: true } },
        },
      },
    },
  },
} satisfies Prisma.BundleInclude;

export type BundleDetailRow = Prisma.BundleGetPayload<{ include: typeof detailInclude }>;

/**
 * All Prisma access for the `bundles` collection. `BundleItem` child rows are
 * managed here (aggregate-owned child, no repo of their own).
 */
@Injectable()
export class BundleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(where: Prisma.BundleWhereInput = {}): Promise<BundleDetailRow[]> {
    return this.prisma.bundle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: detailInclude,
    });
  }

  findBySlug(slug: string): Promise<BundleDetailRow | null> {
    return this.prisma.bundle.findUnique({ where: { slug }, include: detailInclude });
  }

  findById(id: string): Promise<BundleDetailRow | null> {
    return this.prisma.bundle.findUnique({ where: { id }, include: detailInclude });
  }

  async create(
    data: {
      title: string;
      slug: string;
      description: string | null;
      bundlePrice: number;
      isActive: boolean;
    },
    items: Array<{ variantId: string; qty: number }>,
  ): Promise<BundleDetailRow> {
    const created = await this.prisma.bundle.create({ data });
    if (items.length > 0) {
      await this.prisma.bundleItem.createMany({
        data: items.map((i) => ({ ...i, bundleId: created.id })),
      });
    }
    return this.findById(created.id) as Promise<BundleDetailRow>;
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      slug: string;
      description: string | null;
      bundlePrice: number;
      isActive: boolean;
    }>,
    items?: Array<{ variantId: string; qty: number }>,
  ): Promise<BundleDetailRow> {
    await this.prisma.bundle.update({ where: { id }, data });
    if (items) {
      await this.prisma.bundleItem.deleteMany({ where: { bundleId: id } });
      if (items.length > 0) {
        await this.prisma.bundleItem.createMany({
          data: items.map((i) => ({ ...i, bundleId: id })),
        });
      }
    }
    return this.findById(id) as Promise<BundleDetailRow>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bundleItem.deleteMany({ where: { bundleId: id } });
    await this.prisma.bundle.delete({ where: { id } });
  }
}
