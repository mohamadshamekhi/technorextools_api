import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from '../../orders/orders.service';
import { OrderRepository, type OrderDetailRow } from '../../orders/repositories/order.repository';

function toAdminListItem(o: OrderDetailRow) {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total,
    itemCount: o.items.reduce((n, i) => n + i.qty, 0),
    placedAt: o.placedAt,
    userId: o.userId,
  };
}

function toAdminDetail(o: OrderDetailRow) {
  return {
    ...toAdminListItem(o),
    subtotal: o.subtotal,
    discountAmount: o.discountAmount,
    discountCode: o.discount?.code ?? null,
    shippingCost: o.shippingCost,
    shippingMethodTitle: o.shippingMethod?.title ?? null,
    address: o.address,
    items: o.items,
    statusHistory: o.statusHistory.map((h) => ({
      status: h.status,
      note: h.note,
      bySystem: h.bySystem,
      changedByUserId: h.changedByUserId,
      at: h.createdAt,
    })),
    payments: o.payments.map((p) => ({
      gateway: p.gateway,
      status: p.status,
      amount: p.amount,
      refId: p.refId,
      paidAt: p.paidAt,
    })),
  };
}

@Injectable()
export class BackofficeOrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly lifecycle: OrdersService,
  ) {}

  async list(query: { skip: number; take: number; status?: OrderStatus; q?: string }) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { orderNumber: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.orders.paginate(where, query.skip, query.take);
    return { items: rows.map(toAdminListItem), total, skip: query.skip, take: query.take };
  }

  async detail(orderNumber: string) {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return toAdminDetail(order);
  }

  async setStatus(orderNumber: string, status: OrderStatus, adminUserId: string, note?: string) {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    const updated = await this.lifecycle.adminSetStatus(order, status, adminUserId, note);
    return toAdminDetail(updated);
  }
}
