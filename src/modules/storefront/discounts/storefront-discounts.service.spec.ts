import { DiscountAmountType, DiscountKind } from '@prisma/client';
import { StorefrontDiscountsService } from './storefront-discounts.service';
import type { DiscountEvaluatorService } from '../../discounts/discount-evaluator.service';
import type {
  DiscountRepository,
  DiscountWithTargets,
} from '../../discounts/repositories/discount.repository';
import type { DiscountUsageRepository } from '../../discounts/repositories/discount-usage.repository';
import type { CartRepository } from '../../cart/repositories/cart.repository';

function discount(overrides: Partial<DiscountWithTargets> = {}): DiscountWithTargets {
  return {
    id: 'd1',
    code: 'SAVE10',
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
    createdAt: new Date(),
    updatedAt: new Date(),
    targets: [],
    ...overrides,
  };
}

function build(rows: DiscountWithTargets[]) {
  const discounts = {
    findActiveForUser: jest.fn().mockResolvedValue(rows),
  } as unknown as DiscountRepository;
  const usages = {
    countByDiscountAndUser: jest.fn().mockResolvedValue(0),
  } as unknown as DiscountUsageRepository;
  const svc = new StorefrontDiscountsService(
    {} as unknown as CartRepository,
    {} as unknown as DiscountEvaluatorService,
    discounts,
    usages,
  );
  return { svc, usages };
}

describe('StorefrontDiscountsService.active', () => {
  it('drops a discount that already hit its total usage cap', async () => {
    const { svc } = build([discount({ maxUsageTotal: 5, usedCount: 5 })]);
    expect(await svc.active('u1')).toEqual([]);
  });

  it('drops a discount this user already used up', async () => {
    const { svc, usages } = build([discount({ maxUsagePerUser: 1 })]);
    (usages.countByDiscountAndUser as jest.Mock).mockResolvedValue(1);
    expect(await svc.active('u1')).toEqual([]);
  });

  it('keeps a still-usable discount', async () => {
    const { svc } = build([discount({ maxUsageTotal: 5, usedCount: 2 })]);
    const result = await svc.active('u1');
    expect(result).toEqual([
      {
        code: 'SAVE10',
        amountType: DiscountAmountType.percent,
        value: 10,
        minOrderAmount: null,
        endsAt: null,
      },
    ]);
  });
});
