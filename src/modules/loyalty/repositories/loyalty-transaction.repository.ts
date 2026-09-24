import { Injectable } from '@nestjs/common';
import { LoyaltyType, type LoyaltyTransaction } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `loyalty_transactions` collection. */
@Injectable()
export class LoyaltyTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async balanceOf(userId: string): Promise<number> {
    const rows = await this.prisma.loyaltyTransaction.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    return rows._sum.points ?? 0;
  }

  /** Lifetime earned points (ignores redemptions) — basis for loyalty tiers. */
  async lifetimeEarned(userId: string): Promise<number> {
    const rows = await this.prisma.loyaltyTransaction.aggregate({
      where: { userId, type: LoyaltyType.earn },
      _sum: { points: true },
    });
    return rows._sum.points ?? 0;
  }

  listByUser(userId: string, skip: number, take: number): Promise<[LoyaltyTransaction[], number]> {
    return Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.loyaltyTransaction.count({ where: { userId } }),
    ]);
  }

  create(data: {
    userId: string;
    points: number;
    type: LoyaltyType;
    referenceOrderId?: string | null;
    note?: string | null;
  }): Promise<LoyaltyTransaction> {
    return this.prisma.loyaltyTransaction.create({
      data: {
        userId: data.userId,
        points: data.points,
        type: data.type,
        referenceOrderId: data.referenceOrderId ?? null,
        note: data.note ?? null,
      },
    });
  }

  existsForOrder(orderId: string, type: LoyaltyType): Promise<LoyaltyTransaction | null> {
    return this.prisma.loyaltyTransaction.findFirst({
      where: { referenceOrderId: orderId, type },
    });
  }

  findForOrderWithNote(orderId: string, note: string): Promise<LoyaltyTransaction | null> {
    return this.prisma.loyaltyTransaction.findFirst({
      where: { referenceOrderId: orderId, note },
    });
  }
}
