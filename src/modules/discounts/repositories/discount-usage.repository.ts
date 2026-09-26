import { Injectable } from '@nestjs/common';
import type { DiscountUsage } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `discount_usages` collection. */
@Injectable()
export class DiscountUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  countByDiscountAndUser(discountId: string, userId: string): Promise<number> {
    return this.prisma.discountUsage.count({ where: { discountId, userId } });
  }

  record(discountId: string, userId: string, orderId: string): Promise<DiscountUsage> {
    return this.prisma.discountUsage.create({ data: { discountId, userId, orderId } });
  }

  listByDiscount(discountId: string): Promise<DiscountUsage[]> {
    return this.prisma.discountUsage.findMany({
      where: { discountId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
