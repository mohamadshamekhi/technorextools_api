import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OrderStatus, PaymentMethodKind } from '@prisma/client';
import { OrderStatus as Status } from '@prisma/client';
import { OrderRepository, type OrderDetailRow } from '../../orders/repositories/order.repository';
import { UserRepository } from '../../access/repositories/user.repository';
import { statusFa } from '../../orders/orders.service';

export interface OrderListItemView {
  orderNumber: string;
  status: OrderStatus;
  total: number;
  paymentMethod: PaymentMethodKind;
  itemCount: number;
  placedAt: Date;
}

export interface OrderStatsView {
  totalSpend: number;
  paidOrderCount: number;
  /** Last 6 calendar months, oldest first, `month` = "YYYY-MM"; zero-filled for months with no paid orders. */
  monthlyTrend: Array<{ month: string; count: number; amount: number }>;
}

/** Public order tracking — the owner's own detail plus shipment + timeline. */
export interface OrderTrackingView extends OrderDetailView {
  statusLabel: string;
  carrier: string | null;
  trackingNumber: string | null;
  timeline: Array<{ key: OrderStatus; label: string; date: Date | null }>;
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
  items: Array<{
    productTitle: string;
    sku: string | null;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  statusHistory: Array<{ status: OrderStatus; note: string | null; at: Date }>;
  payment: { status: string; refId: string | null; paidAt: Date | null } | null;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

/** The happy-path stages a tracked order walks through, in order. */
const TIMELINE_STAGES: OrderStatus[] = [
  Status.pending_payment,
  Status.paid,
  Status.processing,
  Status.shipped,
  Status.delivered,
];

/** `09123456789` / `+989123456789` / `9123456789` → `9123456789`. */
function normaliseMobile(mobile: string): string {
  return mobile.trim().replace(/^(\+98|0098|98|0)/, '');
}

@Injectable()
export class StorefrontOrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly users: UserRepository,
  ) {}

  /**
   * Public tracking by order number + mobile — no session. The mobile must match
   * either the buyer's account or the receiver on the order's address; anything
   * else is a 404 (never "wrong mobile", which would confirm the order exists).
   */
  async track(orderNumber: string, mobile: string): Promise<OrderTrackingView> {
    const order = await this.orders.findByNumber(orderNumber.trim());
    if (!order) throw new NotFoundException('سفارشی با این مشخصات یافت نشد');
    const given = normaliseMobile(mobile);
    const buyer = await this.users.findById(order.userId);
    const allowed = [order.address.receiverMobile, buyer?.mobile]
      .filter((m): m is string => !!m)
      .map(normaliseMobile);
    if (!allowed.includes(given)) {
      throw new NotFoundException('سفارشی با این مشخصات یافت نشد');
    }
    const detail = this.toDetailView(order);
    const reachedAt = new Map<OrderStatus, Date>();
    for (const h of order.statusHistory) {
      if (!reachedAt.has(h.status)) reachedAt.set(h.status, h.createdAt);
    }
    const stages: OrderStatus[] = order.statusHistory.some((h) => h.status === Status.cancelled)
      ? [...TIMELINE_STAGES.slice(0, 3), Status.cancelled]
      : TIMELINE_STAGES;
    return {
      ...detail,
      statusLabel: statusFa(order.status),
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      timeline: stages.map((key) => ({
        key,
        label: statusFa(key),
        date: reachedAt.get(key) ?? null,
      })),
    };
  }

  async list(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: OrderListItemView[]; total: number; skip: number; take: number }> {
    const [rows, total] = await this.orders.paginate({ userId }, skip, take);
    return { items: rows.map(toListItem), total, skip, take };
  }

  async stats(userId: string): Promise<OrderStatsView> {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const { totalSpend, paidOrderCount, recentOrders } = await this.orders.spendStats(
      userId,
      since,
    );

    const buckets = new Map<string, { count: number; amount: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.set(monthKey(d), { count: 0, amount: 0 });
    }
    for (const o of recentOrders) {
      const bucket = buckets.get(monthKey(o.placedAt));
      if (bucket) {
        bucket.count += 1;
        bucket.amount += o.total;
      }
    }

    return {
      totalSpend,
      paidOrderCount,
      monthlyTrend: Array.from(buckets, ([month, v]) => ({ month, ...v })),
    };
  }

  async detail(userId: string, orderNumber: string): Promise<OrderDetailView> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (order.userId !== userId) throw new ForbiddenException('این سفارش متعلق به شما نیست');
    return this.toDetailView(order);
  }

  private toDetailView(order: OrderDetailRow): OrderDetailView {
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
