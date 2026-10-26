import { Injectable } from '@nestjs/common';
import type { Prisma, Category } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Soft-deleted products keep their `categoryId` but must not count as "in use". */
const liveProducts = { where: { deletedAt: null } } satisfies Prisma.Category$productsArgs;

export type CategoryWithParent = Category & { parent: Category | null };
export type CategoryWithCounts = Category & {
  parent: Category | null;
  _count: { children: number; products: number; attributeGroups: number };
};

/**
 * All Prisma access for the `categories` collection. Consumed by the backoffice
 * categories module and the storefront catalog module — neither touches
 * `PrismaService.category` directly.
 */
@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  findByIdWithCounts(id: string): Promise<CategoryWithCounts | null> {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        _count: { select: { children: true, products: liveProducts, attributeGroups: true } },
      },
    });
  }

  findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  /** Full list, parents first within each sort order — callers build the tree. */
  findMany(where: Prisma.CategoryWhereInput = {}): Promise<Category[]> {
    return this.prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  delete(id: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }

  async paginate(
    where: Prisma.CategoryWhereInput,
    skip: number,
    take: number,
  ): Promise<{ items: CategoryWithCounts[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          parent: true,
          _count: { select: { children: true, products: liveProducts, attributeGroups: true } },
        },
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, total };
  }
}
