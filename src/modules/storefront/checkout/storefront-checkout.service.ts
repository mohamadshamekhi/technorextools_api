import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { Address } from '@prisma/client';
import { PaymentProvider } from '../../../common/payment/payment.provider';
import type { Env } from '../../../config/env.schema';
import { AddressRepository } from '../../address/repositories/address.repository';
import { resolveUnitPrice } from '../../cart/cart.pricing';
import { CartRepository, type CartWithItems } from '../../cart/repositories/cart.repository';
import { AppSettingsService } from '../../content/app-settings.service';
import { DiscountEvaluatorService, type DiscountLine } from '../../discounts/discount-evaluator.service';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { OrdersService } from '../../orders/orders.service';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentRepository } from '../../orders/repositories/payment.repository';
import { ShippingMethodRepository } from '../../shipping/repositories/shipping-method.repository';
import type { PreviewCheckoutInput, StartCheckoutInput } from './storefront-checkout.schemas';

interface ResolvedLine extends DiscountLine {
  kind: 'variant' | 'bundle';
  /** For a variant line: the variant. For a bundle line: null (see `components`). */
  variantId: string | null;
  bundleId: string | null;
  productTitle: string;
  sku: string | null;
  weightGrams: number | null;
  /** Bundle only: the component variants and how many of each per package. */
  components: Array<{ variantId: string; qtyPerPackage: number }>;
}

export interface CheckoutQuote {
  lines: Array<{ variantId: string | null; bundleId: string | null; productTitle: string; qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  loyaltyRedeemPoints: number;
  loyaltyRedeemAmount: number;
  maxRedeemablePoints: number;
  shippingCost: number;
  total: number;
}

export interface CheckoutStartResult {
  orderNumber: string;
  total: number;
  /** Present unless the order was fully covered by points/discount (total 0). */
  paymentUrl: string | null;
  paid: boolean;
}

@Injectable()
export class StorefrontCheckoutService {
  constructor(
    private readonly carts: CartRepository,
    private readonly addresses: AddressRepository,
    private readonly shipping: ShippingMethodRepository,
    private readonly discountEvaluator: DiscountEvaluatorService,
    private readonly loyalty: LoyaltyService,
    private readonly orders: OrderRepository,
    private readonly ordersService: OrdersService,
    private readonly payments: PaymentRepository,
    private readonly paymentProvider: PaymentProvider,
    private readonly settings: AppSettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async quote(userId: string, input: PreviewCheckoutInput): Promise<CheckoutQuote> {
    const cart = await this.loadCartOrThrow(userId);
    const lines = await this.resolveLines(userId, cart);
    return this.computeQuote(userId, lines, input.shippingMethodId, input.discountCode, input.redeemPoints);
  }

  async start(userId: string, mobile: string, input: StartCheckoutInput): Promise<CheckoutStartResult> {
    const windowMin = await this.settings.getNumber('stock_hold_minutes');
    const since = new Date(Date.now() - windowMin * 60_000);
    const live = await this.orders.findLivePendingByUser(userId, since);
    if (live) {
      throw new ConflictException({
        message: 'شما یک سفارش در انتظار پرداخت دارید',
        orderNumber: live.orderNumber,
      });
    }

    const cart = await this.loadCartOrThrow(userId);
    const lines = await this.resolveLines(userId, cart);
    const address = await this.ownedAddress(userId, input.addressId);

    const quote = await this.computeQuote(
      userId,
      lines,
      input.shippingMethodId,
      input.discountCode,
      input.redeemPoints,
    );

    const discount = input.discountCode
      ? await this.discountEvaluator.evaluate(input.discountCode, userId, lines)
      : null;

    const orderNumber = generateOrderNumber();
    const order = await this.orders.create({
      orderNumber,
      userId,
      addressId: address.id,
      discountId: discount?.discountId ?? null,
      shippingMethodId: input.shippingMethodId ?? null,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      shippingCost: quote.shippingCost,
      total: quote.total,
      items: lines.map((l) => ({
        variantId: l.variantId,
        bundleId: l.bundleId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        productTitle: l.productTitle,
        sku: l.sku,
      })),
    });

    if (quote.loyaltyRedeemPoints > 0) {
      await this.loyalty.redeemForOrder(userId, order.id, quote.loyaltyRedeemPoints);
    }
    await this.carts.reserveItems(cart.id, new Date(Date.now() + windowMin * 60_000));

    if (quote.total <= 0) {
      await this.ordersService.markPaid(order, 'ZERO');
      return { orderNumber, total: 0, paymentUrl: null, paid: true };
    }

    const paymentUrl = await this.openPayment(orderNumber, order.id, quote.total, mobile);
    return { orderNumber, total: quote.total, paymentUrl, paid: false };
  }

  /** (Re)open a payment session for an existing pending order — retry after failure. */
  async payAgain(userId: string, orderNumber: string, mobile: string): Promise<{ paymentUrl: string }> {
    const order = await this.ordersService.requireByNumber(orderNumber);
    if (order.userId !== userId) throw new ForbiddenException('این سفارش متعلق به شما نیست');
    if (order.status !== 'pending_payment') {
      throw new BadRequestException('این سفارش قابل پرداخت نیست');
    }
    const windowMin = await this.settings.getNumber('stock_hold_minutes');
    if (order.placedAt.getTime() + windowMin * 60_000 < Date.now()) {
      throw new BadRequestException('مهلت پرداخت این سفارش به پایان رسیده است');
    }
    const paymentUrl = await this.openPayment(order.orderNumber, order.id, order.total, mobile);
    return { paymentUrl };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async openPayment(
    orderNumber: string,
    orderId: string,
    amount: number,
    mobile: string,
  ): Promise<string> {
    const base = this.config.get('PAYMENT_CALLBACK_BASE_URL', { infer: true });
    const callbackUrl = `${base}/api/v1/payment/callback?orderNumber=${encodeURIComponent(orderNumber)}`;
    const result = await this.paymentProvider.createPayment({
      orderNumber,
      amount,
      callbackUrl,
      mobile,
      description: `پرداخت سفارش ${orderNumber}`,
    });
    await this.payments.create({
      orderId,
      gateway: result.gateway,
      authority: result.authority,
      amount,
    });
    return result.redirectUrl;
  }

  private async loadCartOrThrow(userId: string): Promise<CartWithItems> {
    const cart = await this.carts.findActiveByUserId(userId);
    const hasItems = cart?.items.some((i) => i.variantId !== null || i.bundleId !== null);
    if (!cart || !hasItems) throw new BadRequestException('سبد خرید شما خالی است');
    return cart;
  }

  private async resolveLines(userId: string, cart: CartWithItems): Promise<ResolvedLine[]> {
    const lines = cart.items.filter((i) => i.variantId !== null || i.bundleId !== null);
    // Every variant that matters: direct lines + bundle components.
    const variantIds = new Set<string>();
    for (const item of lines) {
      if (item.variantId) variantIds.add(item.variantId);
      for (const bi of item.bundle?.items ?? []) variantIds.add(bi.variantId);
    }
    const now = new Date();
    const reserved = await this.carts.sumLiveReservations([...variantIds], cart.id, now);

    return lines.map((item): ResolvedLine => {
      if (item.bundle) {
        const bundle = item.bundle;
        if (!bundle.isActive || bundle.items.length === 0) {
          throw new BadRequestException('یکی از پکیج‌های سبد دیگر در دسترس نیست');
        }
        for (const bi of bundle.items) {
          if (!bi.variant.isActive) {
            throw new BadRequestException(`یکی از اقلام پکیج «${bundle.title}» در دسترس نیست`);
          }
          const need = bi.qty * item.qty;
          const sellable = bi.variant.stockQty - (reserved.get(bi.variantId) ?? 0);
          if (need > sellable) {
            throw new ConflictException(`موجودی کافی برای پکیج «${bundle.title}» نیست`);
          }
        }
        return {
          kind: 'bundle',
          variantId: null,
          bundleId: bundle.id,
          productId: '__bundle__',
          categoryId: '__bundle__',
          qty: item.qty,
          unitPrice: bundle.bundlePrice,
          productTitle: bundle.title,
          sku: null,
          weightGrams: bundle.items.some((bi) => bi.variant.weightGrams === null)
            ? null
            : bundle.items.reduce((g, bi) => g + (bi.variant.weightGrams ?? 0) * bi.qty, 0),
          components: bundle.items.map((bi) => ({ variantId: bi.variantId, qtyPerPackage: bi.qty })),
        };
      }

      const variant = item.variant;
      if (!variant || !variant.isActive || !variant.product.isActive || variant.product.deletedAt) {
        throw new BadRequestException(`یکی از اقلام سبد دیگر در دسترس نیست`);
      }
      const sellable = variant.stockQty - (reserved.get(variant.id) ?? 0);
      if (item.qty > sellable) {
        throw new ConflictException(`موجودی کافی برای «${variant.product.title}» نیست`);
      }
      const unitPrice = resolveUnitPrice(
        variant.product.basePrice,
        variant.priceOverride,
        variant.priceTiers,
        item.qty,
      );
      return {
        kind: 'variant',
        variantId: variant.id,
        bundleId: null,
        productId: variant.product.id,
        categoryId: variant.product.categoryId,
        qty: item.qty,
        unitPrice,
        productTitle: variant.product.title,
        sku: variant.sku,
        weightGrams: variant.weightGrams,
        components: [],
      };
    });
  }

  private async computeQuote(
    userId: string,
    lines: ResolvedLine[],
    shippingMethodId: string | undefined,
    discountCode: string | undefined,
    redeemPoints: number,
  ): Promise<CheckoutQuote> {
    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

    const discount = discountCode
      ? await this.discountEvaluator.evaluate(discountCode, userId, lines)
      : null;
    const discountAmount = discount?.discountAmount ?? 0;
    const netAfterDiscount = subtotal - discountAmount;

    const maxRedeemablePoints = await this.loyalty.maxRedeemableFor(userId, netAfterDiscount);
    if (redeemPoints > maxRedeemablePoints) {
      throw new BadRequestException(
        `حداکثر امتیاز قابل استفاده برای این سفارش ${maxRedeemablePoints} است`,
      );
    }
    const loyaltyRedeemAmount = redeemPoints;

    let shippingCost = 0;
    if (shippingMethodId) {
      const method = await this.shipping.findById(shippingMethodId);
      if (!method || !method.isActive) throw new BadRequestException('روش ارسال نامعتبر است');
      const netForShipping = netAfterDiscount - loyaltyRedeemAmount;
      const free = method.freeOverAmount !== null && netForShipping >= method.freeOverAmount;
      if (free) {
        shippingCost = 0;
      } else if (method.costType === 'by_weight' && lines.every((l) => l.weightGrams !== null)) {
        // cost = per-kg rate × ceil(total kg); rounds any partial kg up.
        const totalGrams = lines.reduce((g, l) => g + (l.weightGrams ?? 0) * l.qty, 0);
        shippingCost = method.cost * Math.max(1, Math.ceil(totalGrams / 1000));
      } else {
        // flat, or by_weight with an unweighed line → fall back to the flat `cost`.
        shippingCost = method.cost;
      }
    }

    const total = Math.max(0, netAfterDiscount - loyaltyRedeemAmount + shippingCost);

    return {
      lines: lines.map((l) => ({
        variantId: l.variantId,
        bundleId: l.bundleId,
        productTitle: l.productTitle,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.qty * l.unitPrice,
      })),
      subtotal,
      discountCode: discount?.code ?? null,
      discountAmount,
      loyaltyRedeemPoints: redeemPoints,
      loyaltyRedeemAmount,
      maxRedeemablePoints,
      shippingCost,
      total,
    };
  }

  private async ownedAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.addresses.findById(addressId);
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    if (address.userId !== userId) throw new ForbiddenException('این آدرس متعلق به شما نیست');
    return address;
  }
}

/** e.g. `AB-LZ4K9F-7Q2` — sortable-ish, short, collision-safe enough for MVP. */
function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `AB-${ts}-${rand}`;
}
