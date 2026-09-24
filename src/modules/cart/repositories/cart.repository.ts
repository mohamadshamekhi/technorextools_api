import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const cartItemInclude = {
  variant: {
    include: {
      product: true,
      priceTiers: { orderBy: { minQty: 'asc' } },
    },
  },
  bundle: {
    include: {
      items: { include: { variant: { include: { product: { select: { title: true } } } } } },
    },
  },
  sparePart: true,
} satisfies Prisma.CartItemInclude;

const cartInclude = {
  items: { orderBy: { createdAt: 'asc' }, include: cartItemInclude },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartItemWithVariant = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

/**
 * All Prisma access for the `carts` collection. `CartItem` child rows are
 * managed here as part of the cart aggregate (convention 5).
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveById(id: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findFirst({ where: { id, status: 'active' }, include: cartInclude });
  }

  findActiveByToken(sessionToken: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findFirst({
      where: { sessionToken, status: 'active' },
      include: cartInclude,
    });
  }

  /** Active carts with items, untouched since `before` — abandoned-cart candidates. */
  findStaleActive(before: Date, limit: number): Promise<CartWithItems[]> {
    return this.prisma.cart.findMany({
      where: { status: 'active', updatedAt: { lt: before }, items: { some: {} } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      include: cartInclude,
    });
  }

  findActiveByUserId(userId: string): Promise<CartWithItems | null> {
    return this.prisma.cart.findFirst({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      include: cartInclude,
    });
  }

  create(data: Prisma.CartCreateInput): Promise<CartWithItems> {
    return this.prisma.cart.create({ data, include: cartInclude });
  }

  attachToUser(cartId: string, userId: string): Promise<void> {
    return this.prisma.cart
      .update({ where: { id: cartId }, data: { userId } })
      .then(() => undefined);
  }

  setStatus(cartId: string, status: Prisma.CartUpdateInput['status']): Promise<void> {
    return this.prisma.cart
      .update({ where: { id: cartId }, data: { status } })
      .then(() => undefined);
  }

  findItem(cartId: string, itemId: string): Promise<CartItemWithVariant | null> {
    return this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: cartItemInclude,
    });
  }

  findItemByVariant(cartId: string, variantId: string): Promise<CartItemWithVariant | null> {
    return this.prisma.cartItem.findFirst({
      where: { cartId, variantId },
      include: cartItemInclude,
    });
  }

  addItem(cartId: string, variantId: string, qty: number): Promise<void> {
    return this.prisma.cartItem.create({ data: { cartId, variantId, qty } }).then(() => undefined);
  }

  addBundleItem(cartId: string, bundleId: string, qty: number): Promise<void> {
    return this.prisma.cartItem.create({ data: { cartId, bundleId, qty } }).then(() => undefined);
  }

  addSparePartItem(cartId: string, sparePartId: string, qty: number): Promise<void> {
    return this.prisma.cartItem
      .create({ data: { cartId, sparePartId, qty } })
      .then(() => undefined);
  }

  findItemBySparePart(cartId: string, sparePartId: string): Promise<CartItemWithVariant | null> {
    return this.prisma.cartItem.findFirst({
      where: { cartId, sparePartId },
      include: cartItemInclude,
    });
  }

  findItemByBundle(cartId: string, bundleId: string): Promise<CartItemWithVariant | null> {
    return this.prisma.cartItem.findFirst({
      where: { cartId, bundleId },
      include: cartItemInclude,
    });
  }

  setItemQty(itemId: string, qty: number): Promise<void> {
    return this.prisma.cartItem
      .update({ where: { id: itemId }, data: { qty } })
      .then(() => undefined);
  }

  removeItem(itemId: string): Promise<void> {
    return this.prisma.cartItem.delete({ where: { id: itemId } }).then(() => undefined);
  }

  clearItems(cartId: string): Promise<void> {
    return this.prisma.cartItem.deleteMany({ where: { cartId } }).then(() => undefined);
  }

  /** Stamp every line of a cart with a reservation deadline (checkout start). */
  reserveItems(cartId: string, reservedUntil: Date): Promise<void> {
    return this.prisma.cartItem
      .updateMany({ where: { cartId }, data: { reservedUntil } })
      .then(() => undefined);
  }

  /**
   * Atomically take the checkout mutex on a cart. False if another checkout
   * already holds a live lock (double-submit / concurrent tab).
   */
  async acquireCheckoutLock(cartId: string, until: Date): Promise<boolean> {
    const now = new Date();
    const { count } = await this.prisma.cart.updateMany({
      where: {
        id: cartId,
        OR: [
          { checkoutLockUntil: { isSet: false } },
          { checkoutLockUntil: null },
          { checkoutLockUntil: { lt: now } },
        ],
      },
      data: { checkoutLockUntil: until },
    });
    return count === 1;
  }

  async releaseCheckoutLock(cartId: string): Promise<void> {
    await this.prisma.cart.updateMany({ where: { id: cartId }, data: { checkoutLockUntil: null } });
  }

  releaseReservation(cartId: string): Promise<void> {
    return this.prisma.cartItem
      .updateMany({ where: { cartId }, data: { reservedUntil: null } })
      .then(() => undefined);
  }

  /**
   * Sum of still-live reserved quantities per variant, excluding one cart.
   * Used to compute sellable stock during checkout: `available = stockQty − Σ`.
   */
  async sumLiveReservations(
    variantIds: string[],
    excludeCartId: string,
    now: Date,
  ): Promise<Map<string, number>> {
    const wanted = new Set(variantIds);
    const rows = await this.prisma.cartItem.findMany({
      where: {
        cartId: { not: excludeCartId },
        reservedUntil: { gt: now },
        OR: [{ variantId: { in: variantIds } }, { bundleId: { not: null } }],
      },
      select: {
        variantId: true,
        qty: true,
        bundle: { select: { items: { select: { variantId: true, qty: true } } } },
      },
    });
    const out = new Map<string, number>();
    const add = (id: string, n: number) => out.set(id, (out.get(id) ?? 0) + n);
    for (const row of rows) {
      if (row.variantId && wanted.has(row.variantId)) add(row.variantId, row.qty);
      for (const comp of row.bundle?.items ?? []) {
        if (wanted.has(comp.variantId)) add(comp.variantId, comp.qty * row.qty);
      }
    }
    return out;
  }

  /** Live reserved quantities per spare part, excluding one cart. */
  async sumLiveSparePartReservations(
    sparePartIds: string[],
    excludeCartId: string,
    now: Date,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (sparePartIds.length === 0) return out;
    const rows = await this.prisma.cartItem.findMany({
      where: {
        cartId: { not: excludeCartId },
        reservedUntil: { gt: now },
        sparePartId: { in: sparePartIds },
      },
      select: { sparePartId: true, qty: true },
    });
    for (const row of rows) {
      if (row.sparePartId) out.set(row.sparePartId, (out.get(row.sparePartId) ?? 0) + row.qty);
    }
    return out;
  }

  touch(cartId: string): Promise<void> {
    return this.prisma.cart
      .update({ where: { id: cartId }, data: { updatedAt: new Date() } })
      .then(() => undefined);
  }
}
