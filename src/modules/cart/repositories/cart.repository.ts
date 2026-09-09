import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const cartItemInclude = {
  variant: {
    include: {
      product: {
        include: { images: { where: { isMain: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
      },
      priceTiers: { orderBy: { minQty: 'asc' } },
    },
  },
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
    return this.prisma.cartItem
      .create({ data: { cartId, variantId, qty } })
      .then(() => undefined);
  }

  setItemQty(itemId: string, qty: number): Promise<void> {
    return this.prisma.cartItem.update({ where: { id: itemId }, data: { qty } }).then(() => undefined);
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
    const rows = await this.prisma.cartItem.findMany({
      where: {
        variantId: { in: variantIds },
        cartId: { not: excludeCartId },
        reservedUntil: { gt: now },
      },
      select: { variantId: true, qty: true },
    });
    const out = new Map<string, number>();
    for (const row of rows) {
      if (!row.variantId) continue;
      out.set(row.variantId, (out.get(row.variantId) ?? 0) + row.qty);
    }
    return out;
  }

  touch(cartId: string): Promise<void> {
    return this.prisma.cart
      .update({ where: { id: cartId }, data: { updatedAt: new Date() } })
      .then(() => undefined);
  }
}
