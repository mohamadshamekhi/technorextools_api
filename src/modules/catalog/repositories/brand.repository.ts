import { Injectable } from '@nestjs/common';
import type { Brand, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type BrandWithCount = Brand & { _count: { products: number } };

/**
 * All Prisma access for the `brands` collection — including the exclusive
 * distributor flag and authenticity note surfaced on the storefront.
 */
@Injectable()
export class BrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { id } });
  }

  findByIdWithCount(id: string): Promise<BrandWithCount | null> {
    return this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  }

  findBySlug(slug: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { slug } });
  }

  findMany(where: Prisma.BrandWhereInput = {}): Promise<BrandWithCount[]> {
    return this.prisma.brand.findMany({
      where,
      orderBy: { title: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  create(data: Prisma.BrandCreateInput): Promise<Brand> {
    return this.prisma.brand.create({ data });
  }

  update(id: string, data: Prisma.BrandUpdateInput): Promise<Brand> {
    return this.prisma.brand.update({ where: { id }, data });
  }

  delete(id: string): Promise<Brand> {
    return this.prisma.brand.delete({ where: { id } });
  }
}
