import { BadRequestException } from '@nestjs/common';
import { DiscountAmountType, DiscountKind, DiscountTargetType } from '@prisma/client';
import { DiscountEvaluatorService, type DiscountLine } from './discount-evaluator.service';
import type { DiscountRepository } from './repositories/discount.repository';
import type { DiscountUsageRepository } from './repositories/discount-usage.repository';

const lines: DiscountLine[] = [
  { productId: 'p1', categoryId: 'c1', qty: 2, unitPrice: 100_000 }, // 200k
  { productId: 'p2', categoryId: 'c2', qty: 1, unitPrice: 50_000 }, // 50k
];

function makeDiscount(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'd1',
    code: 'SAVE',
    kind: DiscountKind.multi_product,
    amountType: DiscountAmountType.percent,
    value: 10,
    maxUsageTotal: null,
    maxUsagePerUser: null,
    minOrderAmount: null,
    usedCount: 0,
    startsAt: null,
    endsAt: null,
    isActive: true,
    targets: [],
    ...over,
  };
}

function build(discount: ReturnType<typeof makeDiscount> | null, usedByUser = 0) {
  const discounts = {
    findByCode: jest.fn().mockResolvedValue(discount),
  } as unknown as DiscountRepository;
  const usages = {
    countByDiscountAndUser: jest.fn().mockResolvedValue(usedByUser),
  } as unknown as DiscountUsageRepository;
  return new DiscountEvaluatorService(discounts, usages);
}

describe('DiscountEvaluatorService', () => {
  it('applies a percentage to the whole cart when there are no targets', async () => {
    const svc = build(makeDiscount({ value: 10 }));
    const result = await svc.evaluate('SAVE', 'u1', lines);
    expect(result.discountAmount).toBe(25_000); // 10% of 250k
    expect(result.eligibleSubtotal).toBe(250_000);
  });

  it('restricts a fixed amount to matching product lines and clamps to their subtotal', async () => {
    const svc = build(
      makeDiscount({
        amountType: DiscountAmountType.fixed,
        value: 999_999,
        targets: [
          { targetType: DiscountTargetType.product, targetId: 'p2', discountId: 'd1', id: 't1' },
        ],
      }),
    );
    const result = await svc.evaluate('SAVE', 'u1', lines);
    expect(result.discountAmount).toBe(50_000);
  });

  it('rejects an unknown or inactive code', async () => {
    await expect(build(null).evaluate('NOPE', 'u1', lines)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      build(makeDiscount({ isActive: false })).evaluate('SAVE', 'u1', lines),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces per-user usage and minimum order amount', async () => {
    await expect(
      build(makeDiscount({ maxUsagePerUser: 1 }), 1).evaluate('SAVE', 'u1', lines),
    ).rejects.toThrow('استفاده');
    await expect(
      build(makeDiscount({ minOrderAmount: 300_000 })).evaluate('SAVE', 'u1', lines),
    ).rejects.toThrow('حداقل مبلغ');
  });

  it('rejects a code whose product targets match nothing in the cart', async () => {
    const svc = build(
      makeDiscount({
        targets: [
          { targetType: DiscountTargetType.product, targetId: 'other', discountId: 'd1', id: 't1' },
        ],
      }),
    );
    await expect(svc.evaluate('SAVE', 'u1', lines)).rejects.toThrow('اعمال نمی‌شود');
  });
});
