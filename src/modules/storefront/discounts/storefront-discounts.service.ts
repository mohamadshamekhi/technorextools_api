import { BadRequestException, Injectable } from '@nestjs/common';
import { DiscountAmountType } from '@prisma/client';
import { resolveUnitPrice } from '../../cart/cart.pricing';
import { CartRepository } from '../../cart/repositories/cart.repository';
import {
  DiscountEvaluatorService,
  type DiscountLine,
} from '../../discounts/discount-evaluator.service';
import { DiscountRepository } from '../../discounts/repositories/discount.repository';
import { DiscountUsageRepository } from '../../discounts/repositories/discount-usage.repository';

export interface DiscountValidationView {
  valid: true;
  code: string;
  discountAmount: number;
  eligibleSubtotal: number;
}

export interface ActiveDiscountView {
  code: string;
  amountType: DiscountAmountType;
  value: number;
  minOrderAmount: number | null;
  endsAt: Date | null;
}

@Injectable()
export class StorefrontDiscountsService {
  constructor(
    private readonly carts: CartRepository,
    private readonly evaluator: DiscountEvaluatorService,
    private readonly discounts: DiscountRepository,
    private readonly usages: DiscountUsageRepository,
  ) {}

  async active(userId: string): Promise<ActiveDiscountView[]> {
    const rows = await this.discounts.findActiveForUser(userId, new Date());
    const usable = rows.filter((d) => d.maxUsageTotal === null || d.usedCount < d.maxUsageTotal);
    const perUserChecks = await Promise.all(
      usable.map((d) =>
        d.maxUsagePerUser !== null
          ? this.usages.countByDiscountAndUser(d.id, userId)
          : Promise.resolve(0),
      ),
    );
    return usable
      .filter((d, i) => d.maxUsagePerUser === null || perUserChecks[i]! < d.maxUsagePerUser)
      .map((d) => ({
        code: d.code,
        amountType: d.amountType,
        value: d.value,
        minOrderAmount: d.minOrderAmount,
        endsAt: d.endsAt,
      }));
  }

  async validate(userId: string, code: string): Promise<DiscountValidationView> {
    const cart = await this.carts.findActiveByUserId(userId);
    const lines: DiscountLine[] = [];
    for (const i of cart?.items ?? []) {
      if (i.variant && i.variantId) {
        const v = i.variant;
        lines.push({
          productId: v.product.id,
          categoryId: v.product.categoryId,
          qty: i.qty,
          unitPrice: resolveUnitPrice(v.product.basePrice, v.priceOverride, v.priceTiers, i.qty),
        });
      } else if (i.bundle) {
        // Bundles never match product/category targets, but still count toward the cart total.
        lines.push({
          productId: '__bundle__',
          categoryId: '__bundle__',
          qty: i.qty,
          unitPrice: i.bundle.bundlePrice,
        });
      }
    }
    if (lines.length === 0) throw new BadRequestException('سبد خرید شما خالی است');

    const result = await this.evaluator.evaluate(code, userId, lines);
    return {
      valid: true,
      code: result.code,
      discountAmount: result.discountAmount,
      eligibleSubtotal: result.eligibleSubtotal,
    };
  }
}
