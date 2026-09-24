import { ConflictException } from '@nestjs/common';
import { StorefrontCheckoutService } from './storefront-checkout.service';
import type { CartRepository, CartWithItems } from '../../cart/repositories/cart.repository';
import type { OrderRepository } from '../../orders/repositories/order.repository';
import type { StartCheckoutInput } from './storefront-checkout.schemas';

const cart = {
  id: 'c1',
  items: [{ variantId: 'v1' }],
  checkoutLockUntil: new Date(Date.now() + 30_000),
} as unknown as CartWithItems;
const input = { addressId: 'a1', paymentMethod: 'online', redeemPoints: 0 } as StartCheckoutInput;

function build(lockAcquired: boolean) {
  const carts = {
    findActiveByUserId: jest.fn().mockResolvedValue(cart),
    acquireCheckoutLock: jest.fn().mockResolvedValue(lockAcquired),
    releaseCheckoutLock: jest.fn().mockResolvedValue(undefined),
  } as unknown as CartRepository;
  const orders = {
    // a live pending order → `placeOrder` bails out after the lock is taken
    findLivePendingByUser: jest.fn().mockResolvedValue({
      orderNumber: 'AB-1',
      status: 'pending_payment',
      total: 100_000,
      paymentMethod: 'online',
      placedAt: new Date(),
    }),
  } as unknown as OrderRepository;
  const settings = { getNumber: jest.fn().mockResolvedValue(10) };
  const svc = new StorefrontCheckoutService(
    carts,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    orders,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    settings as never,
    {} as never,
  );
  return { svc, carts };
}

describe('StorefrontCheckoutService — double-submit guard', () => {
  it('409s without placing an order when the cart lock is already held', async () => {
    const { svc, carts } = build(false);
    await expect(svc.start('u1', '0912', input)).rejects.toBeInstanceOf(ConflictException);
    expect(carts.releaseCheckoutLock).not.toHaveBeenCalled();
  });

  it('tells the client which order the in-flight checkout produced', async () => {
    const { svc } = build(false);
    await expect(svc.start('u1', '0912', input)).rejects.toMatchObject({
      response: { details: { code: 'checkout_in_progress', orderNumber: 'AB-1' } },
    });
  });

  it('reports the in-flight state for polling', async () => {
    const { svc } = build(true);
    const state = await svc.inFlight('u1');
    expect(state.locked).toBe(true);
    expect(state.order?.orderNumber).toBe('AB-1');
  });

  it('always releases the lock, including when checkout fails', async () => {
    const { svc, carts } = build(true);
    await expect(svc.start('u1', '0912', input)).rejects.toBeInstanceOf(ConflictException);
    expect(carts.releaseCheckoutLock).toHaveBeenCalledWith('c1');
  });
});
