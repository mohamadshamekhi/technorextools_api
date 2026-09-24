import { Injectable } from '@nestjs/common';
import { DiscountTargetType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const withTargets = { targets: true } satisfies Prisma.DiscountInclude;
export type DiscountWithTargets = Prisma.DiscountGetPayload<{ include: typeof withTargets }>;

/**
 * All Prisma access for the `discounts` collection. `DiscountTarget` child rows
 * are managed here (aggregate-owned child, no repo of their own).
 */
@Injectable()
export class DiscountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<DiscountWithTargets | null> {
    return this.prisma.discount.findUnique({ where: { id }, include: withTargets });
  }

  findByCode(code: string): Promise<DiscountWithTargets | null> {
    return this.prisma.discount.findUnique({ where: { code }, include: withTargets });
  }

  paginate(
    where: Prisma.DiscountWhereInput,
    skip: number,
    take: number,
  ): Promise<[DiscountWithTargets[], number]> {
    return Promise.all([
      this.prisma.discount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: withTargets,
      }),
      this.prisma.discount.count({ where }),
    ]);
  }

  async create(
    data: Prisma.DiscountCreateInput,
    targets: Array<{ targetType: 'product' | 'category' | 'user'; targetId: string }>,
  ): Promise<DiscountWithTargets> {
    const created = await this.prisma.discount.create({ data });
    if (targets.length > 0) {
      await this.prisma.discountTarget.createMany({
        data: targets.map((t) => ({ ...t, discountId: created.id })),
      });
    }
    return this.findById(created.id) as Promise<DiscountWithTargets>;
  }

  async update(
    id: string,
    data: Prisma.DiscountUpdateInput,
    targets?: Array<{ targetType: 'product' | 'category' | 'user'; targetId: string }>,
  ): Promise<DiscountWithTargets> {
    await this.prisma.discount.update({ where: { id }, data });
    if (targets) {
      await this.prisma.discountTarget.deleteMany({ where: { discountId: id } });
      if (targets.length > 0) {
        await this.prisma.discountTarget.createMany({
          data: targets.map((t) => ({ ...t, discountId: id })),
        });
      }
    }
    return this.findById(id) as Promise<DiscountWithTargets>;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.discountTarget.deleteMany({ where: { discountId: id } });
    await this.prisma.discount.delete({ where: { id } });
  }

  /**
   * Currently-usable discounts for a customer: active + within the time window,
   * and either targeted at this user or fully public (no targets at all).
   * Product/category-only targeted codes are excluded — they aren't "for" this customer.
   */
  findActiveForUser(userId: string, now: Date): Promise<DiscountWithTargets[]> {
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          {
            OR: [
              { targets: { some: { targetType: DiscountTargetType.user, targetId: userId } } },
              { targets: { none: {} } },
            ],
          },
        ],
      },
      include: withTargets,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Atomically bump `usedCount` when a discounted order is placed. */
  async incrementUsage(id: string): Promise<void> {
    await this.prisma.discount.update({ where: { id }, data: { usedCount: { increment: 1 } } });
  }
}
