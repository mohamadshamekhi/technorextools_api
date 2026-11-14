import { Injectable } from '@nestjs/common';
import type { FinanceCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `finance_categories` collection. */
@Injectable()
export class FinanceCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<FinanceCategory | null> {
    return this.prisma.financeCategory.findUnique({ where: { id } });
  }

  findByIds(ids: string[]): Promise<FinanceCategory[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.financeCategory.findMany({ where: { id: { in: ids } } });
  }

  findBySystemKey(systemKey: string): Promise<FinanceCategory | null> {
    return this.prisma.financeCategory.findFirst({
      where: { systemKey },
      orderBy: { createdAt: 'asc' },
    });
  }

  findMany(where: Prisma.FinanceCategoryWhereInput = {}): Promise<FinanceCategory[]> {
    return this.prisma.financeCategory.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: Prisma.FinanceCategoryCreateInput): Promise<FinanceCategory> {
    return this.prisma.financeCategory.create({ data });
  }

  update(id: string, data: Prisma.FinanceCategoryUpdateInput): Promise<FinanceCategory> {
    return this.prisma.financeCategory.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.financeCategory.delete({ where: { id } });
  }
}
