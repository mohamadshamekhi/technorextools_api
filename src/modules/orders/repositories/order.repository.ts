import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const detailInclude = {
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  address: true,
  shippingMethod: true,
  discount: { select: { code: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof detailInclude }>;

export interface NewOrderInput {
  orderNumber: string;
  userId: string;
  addressId: string;
  discountId: string | null;
  shippingMethodId: string | null;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  total: number;
  items: Array<{
    variantId: string | null;
    bundleId: string | null;
    qty: number;
    unitPrice: number;
    productTitle: string;
    sku: string | null;
  }>;
}

/**
 * All Prisma access for the `orders` collection. `OrderItem` and
 * `OrderStatusHistory` child rows are managed here as part of the aggregate.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByNumber(orderNumber: string): Promise<OrderDetailRow | null> {
    return this.prisma.order.findUnique({ where: { orderNumber }, include: detailInclude });
  }

  findById(id: string): Promise<OrderDetailRow | null> {
    return this.prisma.order.findUnique({ where: { id }, include: detailInclude });
  }

  countByUser(userId: string): Promise<number> {
    return this.prisma.order.count({ where: { userId } });
  }

  countPaidByUser(userId: string): Promise<number> {
    return this.prisma.order.count({
      where: { userId, status: { in: [OrderStatus.paid, OrderStatus.processing, OrderStatus.shipped, OrderStatus.delivered] } },
    });
  }

  /** A pending-payment order whose reservation window has not lapsed. */
  findLivePendingByUser(userId: string, since: Date): Promise<OrderDetailRow | null> {
    return this.prisma.order.findFirst({
      where: { userId, status: OrderStatus.pending_payment, placedAt: { gte: since } },
      orderBy: { placedAt: 'desc' },
      include: detailInclude,
    });
  }

  paginate(
    where: Prisma.OrderWhereInput,
    skip: number,
    take: number,
  ): Promise<[OrderDetailRow[], number]> {
    return Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take,
        include: detailInclude,
      }),
      this.prisma.order.count({ where }),
    ]);
  }

  /** Orders stuck in pending_payment past the reservation window — for the sweep job. */
  findExpiredPending(before: Date): Promise<OrderDetailRow[]> {
    return this.prisma.order.findMany({
      where: { status: OrderStatus.pending_payment, placedAt: { lt: before } },
      include: detailInclude,
    });
  }

  /** Aggregate paid-family revenue and counts for a placed-at window, grouped by status. */
  async salesSummary(from: Date, to: Date) {
    const where: Prisma.OrderWhereInput = { placedAt: { gte: from, lte: to } };
    const [byStatus, paidAgg] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.order.aggregate({
        where: { ...where, status: { in: [OrderStatus.paid, OrderStatus.processing, OrderStatus.shipped, OrderStatus.delivered] } },
        _count: { _all: true },
        _sum: { total: true, discountAmount: true, shippingCost: true },
      }),
    ]);
    return {
      from,
      to,
      paidOrders: paidAgg._count._all,
      paidRevenue: paidAgg._sum.total ?? 0,
      totalDiscount: paidAgg._sum.discountAmount ?? 0,
      totalShipping: paidAgg._sum.shippingCost ?? 0,
      byStatus: byStatus.map((r) => ({
        status: r.status,
        count: r._count._all,
        sum: r._sum.total ?? 0,
      })),
    };
  }

  async create(input: NewOrderInput): Promise<OrderDetailRow> {
    const order = await this.prisma.order.create({
      data: {
        orderNumber: input.orderNumber,
        userId: input.userId,
        addressId: input.addressId,
        discountId: input.discountId,
        shippingMethodId: input.shippingMethodId,
        subtotal: input.subtotal,
        discountAmount: input.discountAmount,
        shippingCost: input.shippingCost,
        total: input.total,
        status: OrderStatus.pending_payment,
        items: { create: input.items },
        statusHistory: {
          create: { status: OrderStatus.pending_payment, bySystem: true, note: 'ثبت سفارش' },
        },
      },
      include: detailInclude,
    });
    return order;
  }

  async setStatus(
    id: string,
    status: OrderStatus,
    opts: { changedByUserId?: string; bySystem?: boolean; note?: string } = {},
  ): Promise<OrderDetailRow> {
    const [order] = await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status }, include: detailInclude }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          status,
          changedByUserId: opts.changedByUserId ?? null,
          bySystem: opts.bySystem ?? false,
          note: opts.note ?? null,
        },
      }),
    ]);
    return order;
  }
}
