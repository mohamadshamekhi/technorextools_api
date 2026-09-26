import { StorefrontOrdersService } from './storefront-orders.service';
import type { OrderRepository } from '../../orders/repositories/order.repository';
import type { UserRepository } from '../../access/repositories/user.repository';
import type { MediaRepository } from '../../media/repositories/media.repository';

describe('StorefrontOrdersService.stats', () => {
  it('zero-fills the trailing 6 months and buckets orders by placed-at month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T12:00:00Z'));
    const orders = {
      spendStats: jest.fn().mockResolvedValue({
        totalSpend: 5_000_000,
        paidOrderCount: 3,
        recentOrders: [
          { placedAt: new Date('2026-09-01T00:00:00Z'), total: 1_000_000 },
          { placedAt: new Date('2026-09-10T00:00:00Z'), total: 500_000 },
          { placedAt: new Date('2026-07-05T00:00:00Z'), total: 2_000_000 },
        ],
      }),
    } as unknown as OrderRepository;
    const users = { findById: jest.fn().mockResolvedValue(null) } as unknown as UserRepository;
    const media = { findByOwners: jest.fn().mockResolvedValue([]) } as unknown as MediaRepository;
    const svc = new StorefrontOrdersService(orders, users, media);

    const stats = await svc.stats('u1');

    expect(orders.spendStats).toHaveBeenCalledWith('u1', new Date(2026, 3, 1));
    expect(stats.totalSpend).toBe(5_000_000);
    expect(stats.paidOrderCount).toBe(3);
    expect(stats.monthlyTrend).toEqual([
      { month: '2026-04', count: 0, amount: 0 },
      { month: '2026-05', count: 0, amount: 0 },
      { month: '2026-06', count: 0, amount: 0 },
      { month: '2026-07', count: 1, amount: 2_000_000 },
      { month: '2026-08', count: 0, amount: 0 },
      { month: '2026-09', count: 2, amount: 1_500_000 },
    ]);
    jest.useRealTimers();
  });
});
