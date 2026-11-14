import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinanceTxnSource, FinanceTxnType } from '@prisma/client';
import type { AccountingPostingService } from '../../accounting/accounting-posting.service';
import type { FinanceAccountRepository } from '../../accounting/repositories/finance-account.repository';
import type { FinanceCategoryRepository } from '../../accounting/repositories/finance-category.repository';
import type { FinanceTransactionRepository } from '../../accounting/repositories/finance-transaction.repository';
import type { OrderRepository } from '../../orders/repositories/order.repository';
import { toCsv } from './accounting.format';
import { createTransactionSchema, profitLossQuerySchema } from './accounting.schemas';
import { BackofficeAccountingService, bucketCashFlow } from './backoffice-accounting.service';

const ACC = 'a'.repeat(24);
const ACC2 = 'b'.repeat(24);
const CAT = 'c'.repeat(24);

function make() {
  const accounts = {
    findById: jest.fn().mockResolvedValue({ id: ACC }),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  };
  const categories = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: CAT, type: FinanceTxnType.expense, systemKey: null }),
    findByIds: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  };
  const txns = {
    findById: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 't1' }),
    softDelete: jest.fn(),
    isAccountUsed: jest.fn().mockResolvedValue(false),
    isCategoryUsed: jest.fn().mockResolvedValue(false),
    sumByCategory: jest.fn().mockResolvedValue([]),
    findLite: jest.fn().mockResolvedValue([]),
  };
  const orders = { findItemCosts: jest.fn().mockResolvedValue([]) };
  const svc = new BackofficeAccountingService(
    accounts as unknown as FinanceAccountRepository,
    categories as unknown as FinanceCategoryRepository,
    txns as unknown as FinanceTransactionRepository,
    {} as AccountingPostingService,
    orders as unknown as OrderRepository,
  );
  jest.spyOn(svc, 'getTransaction').mockResolvedValue({} as never);
  return { svc, accounts, categories, txns, orders };
}

describe('accounting schemas', () => {
  it('requires a category for income/expense and a distinct destination for transfers', () => {
    const base = { amount: 1000, accountId: ACC, occurredAt: '2026-11-01' };
    expect(createTransactionSchema.safeParse({ ...base, type: 'expense' }).success).toBe(false);
    expect(
      createTransactionSchema.safeParse({ ...base, type: 'expense', categoryId: CAT }).success,
    ).toBe(true);
    const sameAcc = createTransactionSchema.safeParse({
      ...base,
      type: 'transfer',
      toAccountId: ACC,
    });
    expect(sameAcc.success).toBe(false);
    expect(
      createTransactionSchema.safeParse({ ...base, type: 'transfer', toAccountId: ACC2 }).success,
    ).toBe(true);
  });

  it('rejects non-positive and fractional amounts', () => {
    const base = { type: 'income', accountId: ACC, categoryId: CAT, occurredAt: '2026-11-01' };
    expect(createTransactionSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, amount: 10.5 }).success).toBe(false);
  });

  it('rejects an inverted P&L range', () => {
    const r = profitLossQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' });
    expect(r.success).toBe(false);
  });
});

describe('BackofficeAccountingService', () => {
  it('rejects a category whose type does not match the transaction', async () => {
    const { svc, txns } = make();
    await expect(
      svc.createTransaction(
        {
          type: FinanceTxnType.income,
          amount: 5,
          accountId: ACC,
          categoryId: CAT,
          occurredAt: new Date(),
        },
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txns.create).not.toHaveBeenCalled();
  });

  it('stores a manual entry with a unique manual sourceKey and the admin as author', async () => {
    const { svc, txns } = make();
    await svc.createTransaction(
      {
        type: FinanceTxnType.expense,
        amount: 5,
        accountId: ACC,
        categoryId: CAT,
        occurredAt: new Date(),
      },
      'admin',
    );
    expect(txns.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: FinanceTxnSource.manual,
        createdByUserId: 'admin',
        toAccountId: null,
        sourceKey: expect.stringMatching(/^manual:/),
      }),
    );
  });

  it('refuses to edit or delete an automatic order posting', async () => {
    const { svc, txns } = make();
    txns.findById.mockResolvedValue({ id: 't', source: FinanceTxnSource.order_sale });
    await expect(svc.removeTransaction('t')).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.updateTransaction('t', { amount: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(txns.softDelete).not.toHaveBeenCalled();
  });

  it('refuses to delete a used account or a system category', async () => {
    const { svc, txns, categories } = make();
    txns.isAccountUsed.mockResolvedValue(true);
    await expect(svc.removeAccount(ACC)).rejects.toBeInstanceOf(ConflictException);
    categories.findById.mockResolvedValue({ id: CAT, systemKey: 'sales' });
    await expect(svc.removeCategory(CAT)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes the P&L: net sales − COGS + other income − expenses, ignoring non-profit categories', async () => {
    const { svc, txns, categories, orders } = make();
    txns.sumByCategory.mockResolvedValue([
      { type: 'income', source: 'order_sale', categoryId: 'sales', _sum: { amount: 1_000_000 } },
      { type: 'expense', source: 'order_refund', categoryId: 'ref', _sum: { amount: 100_000 } },
      { type: 'expense', source: 'manual', categoryId: 'rent', _sum: { amount: 200_000 } },
      { type: 'expense', source: 'manual', categoryId: 'stock', _sum: { amount: 500_000 } },
      { type: 'income', source: 'manual', categoryId: 'misc', _sum: { amount: 50_000 } },
      { type: 'transfer', source: 'manual', categoryId: null, _sum: { amount: 999 } },
    ]);
    categories.findByIds.mockResolvedValue([
      { id: 'rent', title: 'اجاره', affectsProfit: true },
      { id: 'stock', title: 'خرید کالا', affectsProfit: false },
      { id: 'misc', title: 'متفرقه', affectsProfit: true },
    ]);
    txns.findLite.mockResolvedValue([
      {
        occurredAt: new Date('2026-11-02'),
        type: 'income',
        source: 'order_sale',
        amount: 1_000_000,
        orderId: 'o1',
      },
      {
        occurredAt: new Date('2026-11-03'),
        type: 'expense',
        source: 'order_refund',
        amount: 100_000,
        orderId: 'o2',
      },
    ]);
    orders.findItemCosts.mockImplementation((ids: string[]) =>
      Promise.resolve(
        ids[0] === 'o1'
          ? [
              { orderId: 'o1', qty: 2, unitCost: 300_000 },
              { orderId: 'o1', qty: 1, unitCost: null },
            ]
          : [{ orderId: 'o2', qty: 1, unitCost: 60_000 }],
      ),
    );
    const r = await svc.profitLoss({ from: new Date('2026-11-01'), to: new Date('2026-11-05') });
    expect(r.sales).toEqual({ gross: 1_000_000, refunds: 100_000, net: 900_000, orderCount: 1 });
    expect(r.cogs).toEqual({ amount: 540_000, linesWithoutCost: 1 });
    expect(r.grossProfit).toBe(360_000);
    expect(r.otherIncome.total).toBe(50_000);
    expect(r.expenses.total).toBe(200_000);
    expect(r.nonProfitExpenses.total).toBe(500_000);
    expect(r.netProfit).toBe(210_000);
  });
});

describe('accounting helpers', () => {
  it('buckets cash flow by Jalali day, zero-filled', () => {
    const r = bucketCashFlow(
      [{ occurredAt: new Date('2026-11-02T08:00:00Z'), type: FinanceTxnType.income, amount: 10 }],
      new Date('2026-11-01T08:00:00Z'),
      new Date('2026-11-03T08:00:00Z'),
    );
    expect(r.granularity).toBe('day');
    expect(r.buckets.map((b) => b.key)).toEqual(['1405/08/10', '1405/08/11', '1405/08/12']);
    expect(r.buckets[1]).toMatchObject({ income: 10, net: 10 });
  });

  it('writes a BOM, quotes commas and neutralises formulas', () => {
    expect(toCsv([['a,b', '=SUM(A1)', 5]])).toBe('﻿"a,b",\'=SUM(A1),5\r\n');
  });
});
