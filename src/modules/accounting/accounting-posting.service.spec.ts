import { FinanceTxnSource, FinanceTxnType, PaymentMethodKind } from '@prisma/client';
import { AccountingPostingService } from './accounting-posting.service';
import type { FinanceAccountRepository } from './repositories/finance-account.repository';
import type { FinanceCategoryRepository } from './repositories/finance-category.repository';
import type { FinanceTransactionRepository } from './repositories/finance-transaction.repository';

function make(existing: Record<string, unknown> = {}) {
  const accounts = {
    findBySalesPaymentMethod: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((d: object) => Promise.resolve({ id: 'acc-new', ...d })),
  };
  const categories = {
    findBySystemKey: jest.fn().mockResolvedValue(null),
    create: jest
      .fn()
      .mockImplementation((d: { systemKey: string }) =>
        Promise.resolve({ id: `cat-${d.systemKey}`, ...d }),
      ),
  };
  const txns = {
    findBySourceKey: jest
      .fn()
      .mockImplementation((k: string) => Promise.resolve(existing[k] ?? null)),
    createOnce: jest.fn().mockImplementation((d: object) => Promise.resolve({ id: 't1', ...d })),
  };
  const svc = new AccountingPostingService(
    accounts as unknown as FinanceAccountRepository,
    categories as unknown as FinanceCategoryRepository,
    txns as unknown as FinanceTransactionRepository,
  );
  return { svc, accounts, categories, txns };
}

const order = {
  id: 'o1',
  orderNumber: 'TX-1',
  total: 250_000,
  paymentMethod: PaymentMethodKind.cash,
};

describe('AccountingPostingService', () => {
  it('posts a sale on a lazily-created account mapped to the payment method', async () => {
    const { svc, accounts, txns } = make();
    const at = new Date('2026-11-01T10:00:00Z');
    await svc.recordSale(order, at);
    expect(accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({ salesPaymentMethod: PaymentMethodKind.cash, kind: 'cash' }),
    );
    expect(txns.createOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FinanceTxnType.income,
        source: FinanceTxnSource.order_sale,
        amount: 250_000,
        accountId: 'acc-new',
        categoryId: 'cat-sales',
        sourceKey: 'sale:o1',
        occurredAt: at,
      }),
    );
  });

  it('does not post a sale twice', async () => {
    const { svc, txns } = make({ 'sale:o1': { id: 'old' } });
    expect(await svc.recordSale(order, new Date())).toBeNull();
    expect(txns.createOnce).not.toHaveBeenCalled();
  });

  it('skips a zero-total order', async () => {
    const { svc, txns } = make();
    expect(await svc.recordSale({ ...order, total: 0 }, new Date())).toBeNull();
    expect(txns.createOnce).not.toHaveBeenCalled();
  });

  it('refunds exactly the posted sale amount from the same account', async () => {
    const { svc, txns } = make({
      'sale:o1': { id: 's', amount: 240_000, accountId: 'acc-cash', deletedAt: null },
    });
    await svc.recordRefund(order, new Date());
    expect(txns.createOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FinanceTxnType.expense,
        source: FinanceTxnSource.order_refund,
        amount: 240_000,
        accountId: 'acc-cash',
        sourceKey: 'refund:o1',
      }),
    );
  });

  it('posts no refund when no sale was ever posted', async () => {
    const { svc, txns } = make();
    expect(await svc.recordRefund(order, new Date())).toBeNull();
    expect(txns.createOnce).not.toHaveBeenCalled();
  });

  it('never throws from the lifecycle wrapper', async () => {
    const { svc, txns } = make();
    txns.findBySourceKey.mockRejectedValue(new Error('db down'));
    await expect(svc.safeRecordSale(order)).resolves.toBeUndefined();
  });
});
