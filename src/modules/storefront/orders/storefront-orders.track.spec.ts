import { NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { StorefrontOrdersService } from './storefront-orders.service';
import type { OrderDetailRow, OrderRepository } from '../../orders/repositories/order.repository';
import type { UserRepository } from '../../access/repositories/user.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';

const order = {
  id: 'o1',
  orderNumber: 'AB-1',
  userId: 'u1',
  status: OrderStatus.shipped,
  total: 100_000,
  subtotal: 100_000,
  discountAmount: 0,
  shippingCost: 0,
  paymentMethod: 'online',
  placedAt: new Date('2026-09-01T10:00:00Z'),
  carrier: 'تیپاکس',
  trackingNumber: 'TPX-9',
  address: {
    receiverMobile: '09123456789',
    receiverName: 'علی',
    province: 'تهران',
    city: 'تهران',
    fullAddress: 'x',
    postalCode: '1',
  },
  items: [{ productTitle: 'بکس بادی', sku: null, qty: 2, unitPrice: 50_000 }],
  statusHistory: [
    {
      status: OrderStatus.pending_payment,
      note: null,
      createdAt: new Date('2026-09-01T10:00:00Z'),
    },
    { status: OrderStatus.paid, note: null, createdAt: new Date('2026-09-01T10:05:00Z') },
    { status: OrderStatus.shipped, note: null, createdAt: new Date('2026-09-03T09:00:00Z') },
  ],
  payments: [],
  shippingMethod: null,
  discount: null,
} as unknown as OrderDetailRow;

function build(found: OrderDetailRow | null = order, buyerMobile = '09120000000') {
  const orders = { findByNumber: jest.fn().mockResolvedValue(found) } as unknown as OrderRepository;
  const users = {
    findById: jest.fn().mockResolvedValue({ mobile: buyerMobile }),
  } as unknown as UserRepository;
  const media = { findByOwners: jest.fn().mockResolvedValue([]) } as unknown as MediaRepository;
  return new StorefrontOrdersService(orders, users, media);
}

describe('StorefrontOrdersService.track', () => {
  it('matches the receiver mobile in any accepted format', async () => {
    const view = await build().track('AB-1', '+989123456789');
    expect(view.trackingNumber).toBe('TPX-9');
    expect(view.statusLabel).toBe('ارسال‌شده');
  });

  it('also matches the buying account mobile', async () => {
    const view = await build(order, '09120000000').track('AB-1', '09120000000');
    expect(view.orderNumber).toBe('AB-1');
  });

  it('404s on a wrong mobile without revealing that the order exists', async () => {
    await expect(build().track('AB-1', '09350000000')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s on an unknown order number', async () => {
    await expect(build(null).track('AB-NOPE', '09123456789')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('builds a timeline with nulls for stages not reached yet', async () => {
    const view = await build().track('AB-1', '09123456789');
    expect(view.timeline.map((t) => t.key)).toEqual([
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'delivered',
    ]);
    expect(view.timeline.find((t) => t.key === 'processing')?.date).toBeNull();
    expect(view.timeline.find((t) => t.key === 'shipped')?.date).toEqual(
      new Date('2026-09-03T09:00:00Z'),
    );
  });
});
