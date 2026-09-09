import { BadRequestException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import type { LoyaltyTransactionRepository } from './repositories/loyalty-transaction.repository';
import type { AppSettingsService } from '../content/app-settings.service';

function build(opts: { balance?: number; rate?: number; pct?: number } = {}) {
  const txns = {
    balanceOf: jest.fn().mockResolvedValue(opts.balance ?? 0),
    create: jest.fn().mockResolvedValue({}),
    existsForOrder: jest.fn().mockResolvedValue(null),
    findForOrderWithNote: jest.fn().mockResolvedValue(null),
  } as unknown as LoyaltyTransactionRepository;
  const settings = {
    getNumber: jest.fn((key: string) =>
      Promise.resolve(key === 'loyalty_points_per_toman' ? (opts.rate ?? 0.001) : (opts.pct ?? 50)),
    ),
  } as unknown as AppSettingsService;
  return { svc: new LoyaltyService(txns, settings), txns };
}

describe('LoyaltyService', () => {
  it('earns floor(total * rate)', async () => {
    const { svc } = build({ rate: 0.001 });
    expect(await svc.earnAmountFor(1_234_567)).toBe(1234);
  });

  it('caps redeemable points at the lesser of balance and percent-of-net', async () => {
    expect(await build({ balance: 100_000, pct: 50 }).svc.maxRedeemableFor('u1', 40_000)).toBe(20_000);
    expect(await build({ balance: 5_000, pct: 50 }).svc.maxRedeemableFor('u1', 40_000)).toBe(5_000);
  });

  it('refuses to redeem more points than the balance', async () => {
    const { svc } = build({ balance: 100 });
    await expect(svc.redeemForOrder('u1', 'o1', 500)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a negative transaction when redeeming', async () => {
    const { svc, txns } = build({ balance: 1000 });
    await svc.redeemForOrder('u1', 'o1', 300);
    expect(txns.create).toHaveBeenCalledWith(
      expect.objectContaining({ points: -300, referenceOrderId: 'o1' }),
    );
  });
});
