import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderStatus, PaymentMethodKind } from '@prisma/client';
import { OrderRepository, type OrderDetailRow } from '../../orders/repositories/order.repository';

export interface OrderListItemView {
  orderNumber: string;
  status: OrderStatus;
  total: number;
  paymentMethod: PaymentMethodKind;
  itemCount: number;
  placedAt: Date;
}

export interface OrderDetailView extends OrderListItemView {
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  shippingCost: number;
  shippingMethodTitle: string | null;
  address: {
    receiverName: string;
    receiverMobile: string;
    province: string;
    city: string;
    fullAddress: string;
    postalCode: string;
  };
  items: Array<{ productTitle: string; sku: string | null; qty: number; unitPrice: number; lineTotal: number }>;
  statusHistory: Array<{ status: OrderStatus; note: string | null; at: Date }>;
  payment: { status: string; refId: string | null; paidAt: Date | null } | null;
}

function toListItem(o: OrderDetailRow): OrderListItemView {
  return {
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total,
    paymentMethod: o.paymentMethod,
    itemCount: o.items.reduce((n, i) => n + i.qty, 0),
    placedAt: o.placedAt,
  };
}

@Injectable()
export class StorefrontOrdersService {
  constructor(private readonly orders: OrderRepository) {}

  async list(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: OrderListItemView[]; total: number; skip: number; take: number }> {
    const [rows, total] = await this.orders.paginate({ userId }, skip, take);
    return { items: rows.map(toListItem), total, skip, take };
  }

  async detail(userId: string, orderNumber: string): Promise<OrderDetailView> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.userId !== userId) throw new ForbiddenException('این سفارش متعلق به شما نیست');
    const lastPayment = order.payments.at(-1) ?? null;
    return {
      ...toListItem(order),
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      discountCode: order.discount?.code ?? null,
      shippingCost: order.shippingCost,
      shippingMethodTitle: order.shippingMethod?.title ?? null,
      address: {
        receiverName: order.address.receiverName,
        receiverMobile: order.address.receiverMobile,
        province: order.address.province,
        city: order.address.city,
        fullAddress: order.address.fullAddress,
        postalCode: order.address.postalCode,
      },
      items: order.items.map((i) => ({
        productTitle: i.productTitle,
        sku: i.sku,
        qty: i.qty,
        unitPrice: i.unitPrice,
        lineTotal: i.unitPrice * i.qty,
      })),
      statusHistory: order.statusHistory.map((h) => ({
        status: h.status,
        note: h.note,
        at: h.createdAt,
      })),
      payment: lastPayment
        ? { status: lastPayment.status, refId: lastPayment.refId, paidAt: lastPayment.paidAt }
        : null,
    };
  }
}
