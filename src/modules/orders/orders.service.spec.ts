import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import type { OrderDetailRow, OrderRepository } from './repositories/order.repository';
import type { PaymentRepository } from './repositories/payment.repository';
import type { ProductVariantRepository } from '../catalog/repositories/product-variant.repository';
import type { BundleRepository } from '../bundles/repositories/bundle.repository';
import type { SparePartRepository } from '../spare-parts/repositories/spare-part.repository';
import type { CartRepository } from '../cart/repositories/cart.repository';
import type { DiscountRepository } from '../discounts/repositories/discount.repository';
import type { DiscountUsageRepository } from '../discounts/repositories/discount-usage.repository';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import type { ReferralRepository } from '../referral/repositories/referral.repository';
import type { UserRepository } from '../access/repositories/user.repository';
import type { AppSettingsService } from '../content/app-settings.service';
import type { SmsService } from '../../common/sms/sms.service';
import type { NotificationRepository } from '../notifications/repositories/notification.repository';

function orderRow(status: OrderStatus): OrderDetailRow {
  return {
    id: 'o1',
    orderNumber: 'AB-1',
    userId: 'u1',
    status,
    total: 100_000,
    discountId: null,
    items: [{ variantId: 'v1', bundleId: null, sparePartId: null, qty: 2 }],
  } as unknown as OrderDetailRow;
}

/** `transitionResult`: what the atomic compare-and-set returns (null = someone else won). */
function build(transitionResult: OrderDetailRow | null) {
  const orders = {
    transition: jest.fn().mockResolvedValue(transitionResult),
    findById: jest.fn().mockResolvedValue(orderRow(OrderStatus.paid)),
    countPaidByUser: jest.fn().mockResolvedValue(1),
  } as unknown as OrderRepository;
  const variants = { adjustStock: jest.fn() } as unknown as ProductVariantRepository;
  const payments = {
    findLatestPendingForOrder: jest.fn().mockResolvedValue(null),
  } as unknown as PaymentRepository;
  const loyalty = {
    creditForOrder: jest.fn(),
    refundRedemption: jest.fn(),
    adjust: jest.fn(),
  } as unknown as LoyaltyService;
  const carts = {
    findActiveByUserId: jest.fn().mockResolvedValue(null),
  } as unknown as CartRepository;
  const notifications = { create: jest.fn() } as unknown as NotificationRepository;
  const svc = new OrdersService(
    orders,
    payments,
    variants,
    {} as BundleRepository,
    {} as SparePartRepository,
    carts,
    {} as DiscountRepository,
    {} as DiscountUsageRepository,
    loyalty,
    { findByReferredUser: jest.fn().mockResolvedValue(null) } as unknown as ReferralRepository,
    { findById: jest.fn().mockResolvedValue(null) } as unknown as UserRepository,
    { getNumber: jest.fn().mockResolvedValue(0) } as unknown as AppSettingsService,
    { sendTemplate: jest.fn() } as unknown as SmsService,
    notifications,
  );
  return { svc, orders, variants, loyalty, notifications };
}

describe('OrdersService', () => {
  it('applies the paid side effects once when it wins the status race', async () => {
    const { svc, variants, loyalty } = build(orderRow(OrderStatus.paid));
    await svc.markPaid(orderRow(OrderStatus.pending_payment), 'REF');
    expect(variants.adjustStock).toHaveBeenCalledWith('v1', -2);
    expect(loyalty.creditForOrder).toHaveBeenCalled();
  });

  it('skips the paid side effects when a concurrent callback already settled the order', async () => {
    const { svc, variants, loyalty } = build(null);
    await svc.markPaid(orderRow(OrderStatus.pending_payment), 'REF');
    expect(variants.adjustStock).not.toHaveBeenCalled();
    expect(loyalty.creditForOrder).not.toHaveBeenCalled();
  });

  it('restocks once on an admin cancel and 409s when the status moved underneath', async () => {
    const { svc, variants } = build(orderRow(OrderStatus.cancelled));
    await svc.adminSetStatus(orderRow(OrderStatus.paid), OrderStatus.cancelled, 'admin');
    expect(variants.adjustStock).toHaveBeenCalledWith('v1', 2);

    const lost = build(null);
    await expect(
      lost.svc.adminSetStatus(orderRow(OrderStatus.paid), OrderStatus.cancelled, 'admin'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(lost.variants.adjustStock).not.toHaveBeenCalled();
  });

  it('writes an in-app notification for customer-visible status changes', async () => {
    const { svc, notifications } = build(orderRow(OrderStatus.shipped));
    await svc.adminSetStatus(orderRow(OrderStatus.processing), OrderStatus.shipped, 'admin');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'order_shipped' }),
    );

    const noNotify = build(orderRow(OrderStatus.processing));
    await noNotify.svc.adminSetStatus(orderRow(OrderStatus.paid), OrderStatus.processing, 'admin');
    expect(noNotify.notifications.create).not.toHaveBeenCalled();
  });
});
