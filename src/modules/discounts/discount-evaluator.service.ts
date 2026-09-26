import { BadRequestException, Injectable } from '@nestjs/common';
import { DiscountAmountType, DiscountTargetType } from '@prisma/client';
import { DiscountRepository } from './repositories/discount.repository';
import { DiscountUsageRepository } from './repositories/discount-usage.repository';

/** One cart line, reduced to what discount targeting needs. */
export interface DiscountLine {
  productId: string;
  categoryId: string;
  qty: number;
  unitPrice: number;
}

export interface DiscountEvaluation {
  discountId: string;
  code: string;
  amountType: DiscountAmountType;
  value: number;
  /** Toman actually taken off, already clamped to the eligible subtotal. */
  discountAmount: number;
  eligibleSubtotal: number;
}

/**
 * Shared discount-code evaluation — used by the storefront `validate` endpoint
 * and by checkout. Throws a 400 with a Persian message on any rule violation so
 * both callers surface the same error.
 */
@Injectable()
export class DiscountEvaluatorService {
  constructor(
    private readonly discounts: DiscountRepository,
    private readonly usages: DiscountUsageRepository,
  ) {}

  async evaluate(code: string, userId: string, lines: DiscountLine[]): Promise<DiscountEvaluation> {
    const discount = await this.discounts.findByCode(code.trim());
    if (!discount || !discount.isActive) {
      throw new BadRequestException('کد تخفیف نامعتبر است');
    }

    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) {
      throw new BadRequestException('کد تخفیف هنوز فعال نشده است');
    }
    if (discount.endsAt && discount.endsAt < now) {
      throw new BadRequestException('کد تخفیف منقضی شده است');
    }

    const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
    if (discount.minOrderAmount && subtotal < discount.minOrderAmount) {
      throw new BadRequestException(
        `حداقل مبلغ سفارش برای این کد ${discount.minOrderAmount.toLocaleString('fa-IR')} تومان است`,
      );
    }

    if (discount.maxUsageTotal !== null && discount.usedCount >= discount.maxUsageTotal) {
      throw new BadRequestException('ظرفیت استفاده از این کد تخفیف تکمیل شده است');
    }
    if (discount.maxUsagePerUser !== null) {
      const used = await this.usages.countByDiscountAndUser(discount.id, userId);
      if (used >= discount.maxUsagePerUser) {
        throw new BadRequestException('شما پیش‌تر از این کد تخفیف استفاده کرده‌اید');
      }
    }

    const userTargets = discount.targets.filter((t) => t.targetType === DiscountTargetType.user);
    if (userTargets.length > 0 && !userTargets.some((t) => t.targetId === userId)) {
      throw new BadRequestException('این کد تخفیف برای حساب شما نیست');
    }

    const productTargets = new Set(
      discount.targets
        .filter((t) => t.targetType === DiscountTargetType.product)
        .map((t) => t.targetId),
    );
    const categoryTargets = new Set(
      discount.targets
        .filter((t) => t.targetType === DiscountTargetType.category)
        .map((t) => t.targetId),
    );

    let eligibleSubtotal = subtotal;
    if (productTargets.size > 0 || categoryTargets.size > 0) {
      eligibleSubtotal = lines
        .filter((l) => productTargets.has(l.productId) || categoryTargets.has(l.categoryId))
        .reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
      if (eligibleSubtotal === 0) {
        throw new BadRequestException('کد تخفیف روی اقلام سبد شما اعمال نمی‌شود');
      }
    }

    const raw =
      discount.amountType === DiscountAmountType.percent
        ? Math.floor((eligibleSubtotal * discount.value) / 100)
        : discount.value;
    const discountAmount = Math.min(raw, eligibleSubtotal);

    return {
      discountId: discount.id,
      code: discount.code,
      amountType: discount.amountType,
      value: discount.value,
      discountAmount,
      eligibleSubtotal,
    };
  }
}
