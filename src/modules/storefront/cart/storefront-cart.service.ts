import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/token.types';
import { ProductVariantRepository } from '../../catalog/repositories/product-variant.repository';
import { BundleRepository } from '../../bundles/repositories/bundle.repository';
import { SparePartRepository } from '../../spare-parts/repositories/spare-part.repository';
import { resolveUnitPrice } from '../../cart/cart.pricing';
import {
  CartRepository,
  type CartItemWithVariant,
  type CartWithItems,
} from '../../cart/repositories/cart.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { mainImageUrlOf } from '../../media/media.gallery';

const MAX_QTY_PER_LINE = 999;

export interface CartLineView {
  id: string;
  /** `'variant'` for a normal line, `'bundle'` for a product package, `'spare_part'` for a spare part. */
  kind: 'variant' | 'bundle' | 'spare_part';
  variantId: string | null;
  bundleId: string | null;
  sparePartId: string | null;
  productId: string | null;
  productTitle: string;
  productSlug: string | null;
  sku: string | null;
  colorName: string | null;
  imageUrl: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Units currently sellable (for a bundle: how many whole packages). */
  stockQty: number;
  /** `false` when the variant/bundle went inactive, a component was removed, or stock < qty. */
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
    private readonly bundles: BundleRepository,
    private readonly spareParts: SparePartRepository,
    private readonly media: MediaRepository,
  ) {}

  async addBundle(owner: CartOwner, bundleId: string, qty: number): Promise<CartView> {
    const bundle = await this.bundles.findById(bundleId);
    if (!bundle || !bundle.isActive || bundle.items.length === 0) {
      throw new NotFoundException('پکیج مورد نظر یافت نشد');
    }
    const packagesInStock = Math.min(
      ...bundle.items.map((bi) => (bi.qty > 0 ? Math.floor(bi.variant.stockQty / bi.qty) : 0)),
    );
    if (packagesInStock < 1) {
      throw new ConflictException('این پکیج موجود نیست');
    }

    const cart = await this.ensureCart(owner);
    const existing = await this.carts.findItemByBundle(cart.id, bundleId);
    const desired = (existing?.qty ?? 0) + qty;
    const capped = Math.min(desired, packagesInStock, MAX_QTY_PER_LINE);

    if (existing) {
      if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
    } else {
      await this.carts.addBundleItem(cart.id, bundleId, capped);
    }
    await this.carts.touch(cart.id);
    return this.reload(cart.id);
  }

  async addSparePart(owner: CartOwner, sparePartId: string, qty: number): Promise<CartView> {
    const part = await this.spareParts.findById(sparePartId);
    if (!part || !part.isActive) {
      throw new NotFoundException('قطعه یدکی مورد نظر یافت نشد');
    }
    if (part.stockQty < 1) {
      throw new ConflictException('این قطعه موجود نیست');
    }

    const cart = await this.ensureCart(owner);
    const existing = await this.carts.findItemBySparePart(cart.id, sparePartId);
    const capped = Math.min((existing?.qty ?? 0) + qty, part.stockQty, MAX_QTY_PER_LINE);

    if (existing) {
      if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
    } else {
      await this.carts.addSparePartItem(cart.id, sparePartId, capped);
    }
    await this.carts.touch(cart.id);
    return this.reload(cart.id);
  }

  /** Read the current cart; returns an empty shell (no persistence) when none exists. */
  async getCart({ user, token }: CartOwner): Promise<CartView> {
    const cart = await this.locate({ user, token });
    if (!cart) {
      return { token: token ?? '', items: [], itemCount: 0, subtotal: 0, fulfillable: true };
    }
    return this.render(cart);
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
    const stock = item.bundle
      ? Math.min(
          ...item.bundle.items.map((bi) =>
            bi.qty > 0 ? Math.floor(bi.variant.stockQty / bi.qty) : 0,
          ),
        )
      : item.sparePart
        ? item.sparePart.stockQty
        : (item.variant?.stockQty ?? 0);
    if (stock < 1) {
      throw new ConflictException('این کالا دیگر موجود نیست');
    }
    const capped = Math.min(qty, MAX_QTY_PER_LINE, Math.max(stock, 1));
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
      if (line.variantId) {
        const stock = line.variant?.stockQty ?? 0;
        const existing = userCart.items.find((i) => i.variantId === line.variantId);
        const desired = (existing?.qty ?? 0) + line.qty;
        const capped = Math.min(desired, MAX_QTY_PER_LINE, stock || MAX_QTY_PER_LINE);
        if (existing) {
          if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
        } else {
          await this.carts.addItem(userCart.id, line.variantId, capped);
        }
      } else if (line.sparePartId) {
        const stock = line.sparePart?.stockQty ?? 0;
        const existing = userCart.items.find((i) => i.sparePartId === line.sparePartId);
        const capped = Math.min(
          (existing?.qty ?? 0) + line.qty,
          MAX_QTY_PER_LINE,
          stock || MAX_QTY_PER_LINE,
        );
        if (existing) {
          if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
        } else {
          await this.carts.addSparePartItem(userCart.id, line.sparePartId, capped);
        }
      } else if (line.bundleId) {
        const existing = userCart.items.find((i) => i.bundleId === line.bundleId);
        const capped = Math.min((existing?.qty ?? 0) + line.qty, MAX_QTY_PER_LINE);
        if (existing) {
          if (capped !== existing.qty) await this.carts.setItemQty(existing.id, capped);
        } else {
          await this.carts.addBundleItem(userCart.id, line.bundleId, capped);
        }
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
    return this.render(cart);
  }

  /** Build the view, stitching each line's product main image from `media`. */
  private async render(cart: CartWithItems): Promise<CartView> {
    const productIds = [
      ...new Set(cart.items.map((i) => i.variant?.product.id).filter((id): id is string => !!id)),
    ];
    const rows = await this.media.findByOwners('PRODUCT', productIds);
    const imageByProduct = new Map<string, string | null>();
    for (const id of productIds) {
      imageByProduct.set(id, mainImageUrlOf(rows.filter((r) => r.ownerId === id)));
    }
    const partIds = [
      ...new Set(cart.items.map((i) => i.sparePartId).filter((id): id is string => !!id)),
    ];
    const partRows = await this.media.findByOwners('SPARE_PART', partIds);
    const imageBySparePart = new Map<string, string | null>();
    for (const id of partIds) {
      imageBySparePart.set(id, mainImageUrlOf(partRows.filter((r) => r.ownerId === id)));
    }
    return toView(cart, imageByProduct, imageBySparePart);
  }
}

function toView(
  cart: CartWithItems,
  imageByProduct: Map<string, string | null>,
  imageBySparePart: Map<string, string | null>,
): CartView {
  const items = cart.items
    .filter((i) => i.variantId !== null || i.bundleId !== null || i.sparePartId !== null)
    .map((i) => toLine(i, imageByProduct, imageBySparePart));
  const subtotal = items.reduce((sum, l) => sum + l.lineTotal, 0);
  return {
    token: cart.sessionToken,
    items,
    itemCount: items.reduce((n, l) => n + l.qty, 0),
    subtotal,
    fulfillable: items.length > 0 && items.every((l) => l.available),
  };
}

function toLine(
  item: CartItemWithVariant,
  imageByProduct: Map<string, string | null>,
  imageBySparePart: Map<string, string | null>,
): CartLineView {
  if (item.sparePart) {
    const part = item.sparePart;
    return {
      id: item.id,
      kind: 'spare_part',
      variantId: null,
      bundleId: null,
      sparePartId: part.id,
      productId: null,
      productTitle: part.title,
      productSlug: part.slug,
      sku: part.partNumber,
      colorName: null,
      imageUrl: imageBySparePart.get(part.id) ?? null,
      qty: item.qty,
      unitPrice: part.price,
      lineTotal: part.price * item.qty,
      stockQty: part.stockQty,
      available: part.isActive && part.deletedAt === null && part.stockQty >= item.qty,
    };
  }

  if (item.bundle) {
    const bundle = item.bundle;
    const packagesInStock = bundle.items.length
      ? Math.min(
          ...bundle.items.map((bi) => (bi.qty > 0 ? Math.floor(bi.variant.stockQty / bi.qty) : 0)),
        )
      : 0;
    const available =
      bundle.isActive &&
      bundle.items.every((bi) => bi.variant.isActive) &&
      packagesInStock >= item.qty;
    return {
      id: item.id,
      kind: 'bundle',
      variantId: null,
      bundleId: bundle.id,
      sparePartId: null,
      productId: null,
      productTitle: bundle.title,
      productSlug: bundle.slug,
      sku: null,
      colorName: null,
      imageUrl: null,
      qty: item.qty,
      unitPrice: bundle.bundlePrice,
      lineTotal: bundle.bundlePrice * item.qty,
      stockQty: packagesInStock,
      available,
    };
  }

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
    kind: 'variant',
    variantId: variant.id,
    bundleId: null,
    sparePartId: null,
    productId: product.id,
    productTitle: product.title,
    productSlug: product.slug,
    sku: variant.sku,
    colorName: variant.colorName,
    imageUrl: imageByProduct.get(product.id) ?? null,
    qty: item.qty,
    unitPrice,
    lineTotal: unitPrice * item.qty,
    stockQty: variant.stockQty,
    available,
  };
}
