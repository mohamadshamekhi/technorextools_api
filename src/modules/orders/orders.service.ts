import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, OrderStatus, PaymentMethodKind } from '@prisma/client';
import { SmsService, type SmsTemplate } from '../../common/sms/sms.service';
import { CartRepository } from '../cart/repositories/cart.repository';
import { ProductVariantRepository } from '../catalog/repositories/product-variant.repository';
import { BundleRepository } from '../bundles/repositories/bundle.repository';
import { SparePartRepository } from '../spare-parts/repositories/spare-part.repository';
import { AppSettingsService } from '../content/app-settings.service';
import { DiscountRepository } from '../discounts/repositories/discount.repository';
import { DiscountUsageRepository } from '../discounts/repositories/discount-usage.repository';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralRepository } from '../referral/repositories/referral.repository';
import { UserRepository } from '../access/repositories/user.repository';
import { NotificationRepository } from '../notifications/repositories/notification.repository';
import { OrderRepository, type OrderDetailRow } from './repositories/order.repository';
import { PaymentRepository } from './repositories/payment.repository';

/** Terminal / paid-family statuses that must never regress. */
const PAID_FAMILY: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.processing,
  OrderStatus.shipped,
  OrderStatus.delivered,
];

/** Allowed manual (admin) status transitions. */
const ADMIN_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.paid]: [OrderStatus.processing, OrderStatus.cancelled],
  [OrderStatus.processing]: [OrderStatus.shipped, OrderStatus.cancelled],
  [OrderStatus.shipped]: [OrderStatus.delivered],
};

/** Status changes the customer gets an in-app notification for. */
const IN_APP_TYPE: Partial<Record<OrderStatus, NotificationType>> = {
  [OrderStatus.shipped]: NotificationType.order_shipped,
  [OrderStatus.delivered]: NotificationType.order_delivered,
  [OrderStatus.cancelled]: NotificationType.order_cancelled,
};

/**
 * Order lifecycle orchestrator (aggregate-owned). The single place that moves
 * stock, loyalty points, referral rewards and cart state as an order changes
 * status — called by checkout, the payment callback, the sweep job and the
 * backoffice.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
    private readonly variants: ProductVariantRepository,
    private readonly bundles: BundleRepository,
    private readonly spareParts: SparePartRepository,
    private readonly carts: CartRepository,
    private readonly discounts: DiscountRepository,
    private readonly discountUsages: DiscountUsageRepository,
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralRepository,
    private readonly users: UserRepository,
    private readonly settings: AppSettingsService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationRepository,
  ) {}

  async requireByNumber(orderNumber: string): Promise<OrderDetailRow> {
    const order = await this.orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    return order;
  }

  /**
   * Settle a successful payment. Idempotent — the status flip is an atomic
   * compare-and-set, so a duplicate/concurrent callback applies the side
   * effects (stock, discount usage, points, cart) exactly once.
   */
  async markPaid(order: OrderDetailRow, refId: string): Promise<OrderDetailRow> {
    if (PAID_FAMILY.includes(order.status)) return order;
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('این سفارش قابل پرداخت نیست');
    }

    const paid = await this.orders.transition(
      order.id,
      [OrderStatus.pending_payment],
      OrderStatus.paid,
      {
        bySystem: true,
        note: 'پرداخت موفق',
      },
    );
    if (!paid) return (await this.orders.findById(order.id)) ?? order;

    await this.adjustOrderStock(order, -1);

    const pending = await this.payments.findLatestPendingForOrder(order.id);
    if (pending) await this.payments.markSuccess(pending.id, refId);

    if (order.discountId) {
      await this.discounts.incrementUsage(order.discountId);
      await this.discountUsages.record(order.discountId, order.userId, order.id);
    }

    await this.loyalty.creditForOrder(order.userId, order.id, order.total);
    await this.releaseCart(order.userId, { convert: true });

    // After the status flip: exactly 1 order is now in the paid family → this is the first.
    await this.grantReferralRewardIfFirstPaid(order.userId);
    void this.notify(order.userId, 'order_paid', [order.orderNumber]);
    return paid;
  }

  /** Admin confirms cash received for a `pending_payment` cash-method order (backoffice). */
  async confirmCashPayment(order: OrderDetailRow, adminUserId: string): Promise<OrderDetailRow> {
    if (order.paymentMethod !== PaymentMethodKind.cash) {
      throw new BadRequestException('این سفارش با روش پرداخت نقدی ثبت نشده است');
    }
    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('این سفارش قابل تسویه نقدی نیست');
    }
    return this.markPaid(order, `CASH:${adminUserId}`);
  }

  /** A failed or cancelled payment attempt (from the callback). */
  async markPaymentFailed(order: OrderDetailRow, reason: string): Promise<OrderDetailRow> {
    const failed = await this.abandon(
      order,
      OrderStatus.payment_failed,
      `پرداخت ناموفق: ${reason}`,
    );
    return failed ?? (await this.orders.findById(order.id)) ?? order;
  }

  /** Reservation window lapsed with no successful payment (sweep job). */
  async expire(order: OrderDetailRow): Promise<void> {
    if (await this.abandon(order, OrderStatus.abandoned, 'انقضای مهلت پرداخت')) {
      this.logger.log(`order ${order.orderNumber} expired`);
    }
  }

  /**
   * Roll back a just-placed order whose checkout failed half-way (compensation —
   * the checkout steps aren't one DB transaction). Returns points, releases the
   * reservation, and parks the order as `abandoned`.
   */
  async abortCheckout(order: OrderDetailRow): Promise<void> {
    await this.abandon(order, OrderStatus.abandoned, 'خطا در ثبت سفارش');
  }

  async adminSetStatus(
    order: OrderDetailRow,
    next: OrderStatus,
    adminUserId: string,
    note?: string,
    shipment?: { carrier?: string | null; trackingNumber?: string | null },
  ): Promise<OrderDetailRow> {
    const allowed = ADMIN_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`تغییر وضعیت از ${order.status} به ${next} مجاز نیست`);
    }
    // Compare-and-set on the status we validated against — two admins racing the
    // same cancel can't both restock.
    const updated = await this.orders.transition(order.id, [order.status], next, {
      changedByUserId: adminUserId,
      note,
    });
    if (!updated)
      throw new ConflictException('وضعیت سفارش همزمان تغییر کرده است؛ دوباره تلاش کنید');

    if (next === OrderStatus.cancelled && PAID_FAMILY.includes(order.status)) {
      await this.adjustOrderStock(order, 1);
      await this.loyalty.refundRedemption(order.userId, order.id);
    }
    const withShipment =
      shipment && (shipment.carrier !== undefined || shipment.trackingNumber !== undefined)
        ? ((await this.orders.setShipment(order.id, shipment)) ?? updated)
        : updated;
    void this.notify(order.userId, 'order_status', [order.orderNumber, statusFa(next)]);
    await this.notifyInApp(order.userId, order.orderNumber, next);
    return withShipment;
  }

  /** pending_payment → `to`, then undo the checkout's holds. Null if it wasn't pending anymore. */
  private async abandon(
    order: OrderDetailRow,
    to: OrderStatus,
    note: string,
  ): Promise<OrderDetailRow | null> {
    if (order.status !== OrderStatus.pending_payment) return null;
    const updated = await this.orders.transition(order.id, [OrderStatus.pending_payment], to, {
      bySystem: true,
      note,
    });
    if (!updated) return null;
    const pending = await this.payments.findLatestPendingForOrder(order.id);
    if (pending) await this.payments.markFailed(pending.id);
    await this.loyalty.refundRedemption(order.userId, order.id);
    await this.releaseCart(order.userId, { convert: false });
    return updated;
  }

  /** Move stock for every order line. `sign` = -1 to consume (on paid), +1 to restock (on cancel). */
  private async adjustOrderStock(order: OrderDetailRow, sign: 1 | -1): Promise<void> {
    for (const item of order.items) {
      if (item.variantId) {
        await this.variants.adjustStock(item.variantId, sign * item.qty);
      } else if (item.sparePartId) {
        await this.spareParts.adjustStock(item.sparePartId, sign * item.qty);
      } else if (item.bundleId) {
        const bundle = await this.bundles.findById(item.bundleId);
        for (const bi of bundle?.items ?? []) {
          await this.variants.adjustStock(bi.variantId, sign * bi.qty * item.qty);
        }
      }
    }
  }

  private async grantReferralRewardIfFirstPaid(userId: string): Promise<void> {
    const paidCount = await this.orders.countPaidByUser(userId);
    if (paidCount !== 1) return; // this call happens right after the status flip; exactly 1 = first
    const referral = await this.referrals.findByReferredUser(userId);
    if (!referral || referral.rewardStatus === 'granted') return;
    const points = await this.settings.getNumber('referral_reward_points');
    if (points > 0) {
      await this.loyalty.adjust(referral.referrerUserId, points, 'پاداش معرفی دوست');
    }
    await this.referrals.markGranted(referral.id);
  }

  private async releaseCart(userId: string, opts: { convert: boolean }): Promise<void> {
    const cart = await this.carts.findActiveByUserId(userId);
    if (!cart) return;
    if (opts.convert) {
      await this.carts.clearItems(cart.id);
      await this.carts.setStatus(cart.id, 'converted');
    } else {
      await this.carts.releaseReservation(cart.id);
    }
  }

  /** In-app notification for the customer-visible status changes. Never fails the caller. */
  private async notifyInApp(
    userId: string,
    orderNumber: string,
    status: OrderStatus,
  ): Promise<void> {
    const type = IN_APP_TYPE[status];
    if (!type) return;
    try {
      await this.notifications.create({
        userId,
        type,
        title: `سفارش ${statusFa(status)}`,
        body: `سفارش ${orderNumber} ${statusFa(status)} شد.`,
      });
    } catch (err) {
      this.logger.warn(`in-app notify failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async notify(userId: string, template: SmsTemplate, vars: string[]): Promise<void> {
    try {
      const user = await this.users.findById(userId);
      if (user?.mobile) await this.sms.sendTemplate(user.mobile, template, vars);
    } catch (err) {
      this.logger.warn(`sms notify failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Persian label of a status — also used by the public order-tracking view. */
export function statusFa(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    pending_payment: 'در انتظار پرداخت',
    payment_failed: 'پرداخت ناموفق',
    abandoned: 'رها شده',
    paid: 'پرداخت‌شده',
    processing: 'در حال آماده‌سازی',
    shipped: 'ارسال‌شده',
    delivered: 'تحویل‌شده',
    cancelled: 'لغوشده',
  };
  return map[status];
}
