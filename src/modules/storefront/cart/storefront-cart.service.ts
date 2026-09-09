import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/token.types';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { resolveUnitPrice } from '../../cart/cart.pricing';
import {
  CartRepository,
  type CartItemWithVariant,
  type CartWithItems,
} from '../../cart/repositories/cart.repository';

const MAX_QTY_PER_LINE = 999;

export interface CartLineView {
  id: string;
  variantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  sku: string;
  colorName: string | null;
  imageUrl: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Units currently sellable. */
  stockQty: number;
  /** `false` when the variant went inactive, the product was removed, or stock < qty. */
  available: boolean;
}

export interface CartView {
  /** Persist this (guest) — send it back as the `X-Cart-Token` header. */
  token: string;
  items: CartLineView[];
  itemCount: number;
  subtotal: number;
  /** `true` when every line is `available`. */
  fulfillable: boolean;
}

interface CartOwner {
  user?: AuthenticatedUser;
  token?: string;
}

@Injectable()
export class StorefrontCartService {
  constructor(
    private readonly carts: CartRepository,
    private readonly variants: ProductVariantRepository,
  ) {}

  /** Read the current cart; returns an empty shell (no persistence) when none exists. */
  async getCart({ user, token }: CartOwner): Promise<CartView> {
    const cart = await this.locate({ user, token });
    if (!cart) {
      return { token: token ?? '', items: [], itemCount: 0, subtotal: 0, fulfillable: true };
    }
    return toView(cart);
  }

  async addItem(owner: CartOwner, variantId: string, qty: number): Promise<CartView> {
    const variant = await this.variants.findByIdForCart(variantId);
    if (
      !variant ||
      !variant.isActive ||
      !variant.product.isActive ||
      variant.product.deletedAt !== null
    ) {
      throw new NotFoundException('محصول مورد نظر یافت نشد');
    }
    if (variant.stockQty < 1) {
      throw new ConflictException('این کالا موجود نیست');
    }

    const cart = await this.ensureCart(owner);
    const existing = await this.carts.findItemByVariant(cart.id, variantId);
    const desired = (existing?.qty ?? 0) + qty;
    const capped = Math.min(desired, variant.stockQty, MAX_QTY_PER_LINE);

    if (existing) {
      if (capped !== existing.qty) {
        await this.carts.setItemQty(existing.id, capped);
      }
    } else {
      await this.carts.addItem(cart.id, variantId, capped);
    }
    await this.carts.touch(cart.id);
    return this.reload(cart.id);
  }

  async updateItem(owner: CartOwner, itemId: string, qty: number): Promise<CartView> {
    const cart = await this.locate(owner);
    if (!cart) {
      throw new NotFoundException('سبد خرید یافت نشد');
    }
    const item = await this.carts.findItem(cart.id, itemId);
    if (!item) {
      throw new NotFoundException('آیتم در سبد خرید یافت نشد');
    }
    const stock = item.variant?.stockQty ?? 0;
    const capped = Math.min(qty, MAX_QTY_PER_LINE, Math.max(stock, 1));
    if (stock < 1) {
      throw new ConflictException('این کالا دیگر موجود نیست');
    }
    await this.carts.setItemQty(itemId, capped);
    await this.carts.touch(cart.id);
    return this.reload(cart.id);
  }

  async removeItem(owner: CartOwner, itemId: string): Promise<CartView> {
    const cart = await this.locate(owner);
    if (!cart) {
      throw new NotFoundException('سبد خرید یافت نشد');
    }
    const item = await this.carts.findItem(cart.id, itemId);
    if (!item) {
      throw new NotFoundException('آیتم در سبد خرید یافت نشد');
    }
    await this.carts.removeItem(itemId);
    await this.carts.touch(cart.id);
    return this.reload(cart.id);
  }

  async clear(owner: CartOwner): Promise<CartView> {
    const cart = await this.locate(owner);
    if (cart) {
      await this.carts.clearItems(cart.id);
      await this.carts.touch(cart.id);
    }
    return this.getCart(owner);
  }

  /**
   * Fold a guest cart (identified by its session token) into the user's cart on
   * login. Called from `AuthService.verifyOtp`. Best-effort — never throws.
   */
  async mergeGuestCartIntoUser(userId: string, guestToken: string): Promise<void> {
    const guest = await this.carts.findActiveByToken(guestToken);
    if (!guest || guest.userId === userId || guest.userId !== null) {
      return;
    }

    const userCart = await this.carts.findActiveByUserId(userId);
    if (!userCart) {
      await this.carts.attachToUser(guest.id, userId);
      return;
    }

    for (const line of guest.items) {
      if (!line.variantId) continue;
      const stock = line.variant?.stockQty ?? 0;
      const existing = userCart.items.find((i) => i.variantId === line.variantId);
      const desired = (existing?.qty ?? 0) + line.qty;
      const capped = Math.min(desired, MAX_QTY_PER_LINE, stock || MAX_QTY_PER_LINE);
      if (existing) {
        if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
      } else {
        await this.carts.addItem(userCart.id, line.variantId, capped);
      }
    }
    await this.carts.setStatus(guest.id, 'merged');
    await this.carts.touch(userCart.id);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async locate({ user, token }: CartOwner): Promise<CartWithItems | null> {
    if (user) {
      const own = await this.carts.findActiveByUserId(user.id);
      if (own) return own;
      if (token) {
        const guest = await this.carts.findActiveByToken(token);
        if (guest && guest.userId === null) {
          await this.carts.attachToUser(guest.id, user.id);
          return this.carts.findActiveById(guest.id);
        }
      }
      return null;
    }
    if (token) {
      return this.carts.findActiveByToken(token);
    }
    return null;
  }

  private async ensureCart(owner: CartOwner): Promise<CartWithItems> {
    const found = await this.locate(owner);
    if (found) return found;
    if (owner.token && !owner.user) {
      // A token was supplied but no active cart matched it — reject rather than
      // silently minting a second token the client won't know about.
      throw new BadRequestException('توکن سبد خرید نامعتبر است');
    }
    return this.carts.create({
      sessionToken: randomBytes(24).toString('base64url'),
      ...(owner.user ? { user: { connect: { id: owner.user.id } } } : {}),
    });
  }

  private async reload(cartId: string): Promise<CartView> {
    const cart = await this.carts.findActiveById(cartId);
    if (!cart) throw new NotFoundException('سبد خرید یافت نشد');
    return toView(cart);
  }
}

function toView(cart: CartWithItems): CartView {
  const items = cart.items
    .filter((i): i is CartItemWithVariant & { variantId: string } => i.variantId !== null)
    .map((i) => toLine(i));
  const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
  return {
    token: cart.sessionToken,
    items,
    itemCount: items.reduce((n, l) => n + l.qty, 0),
    subtotal,
    fulfillable: items.length > 0 && items.every((l) => l.available),
  };
}

function toLine(item: CartItemWithVariant): CartLineView {
  const variant = item.variant!;
  const product = variant.product;
  const unitPrice = resolveUnitPrice(
    product.basePrice,
    variant.priceOverride,
    variant.priceTiers,
    item.qty,
  );
  const available =
    variant.isActive &&
    product.isActive &&
    product.deletedAt === null &&
    variant.stockQty >= item.qty;
  return {
    id: item.id,
    variantId: variant.id,
    productId: product.id,
    productTitle: product.title,
    productSlug: product.slug,
    sku: variant.sku,
    colorName: variant.colorName,
    imageUrl: product.images[0]?.url ?? null,
    qty: item.qty,
    unitPrice,
    lineTotal: unitPrice * item.qty,
    stockQty: variant.stockQty,
    available,
  };
}
