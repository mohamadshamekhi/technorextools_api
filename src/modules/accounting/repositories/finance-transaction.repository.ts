import { Injectable } from '@nestjs/common';
import { Prisma, type FinanceTransaction, type FinanceTxnType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Prisma on Mongo omits unset optional fields, and `deletedAt: null` only matches an
 * explicit null — so every insert below writes `deletedAt: null` explicitly.
 */
const LIVE = { deletedAt: null } satisfies Prisma.FinanceTransactionWhereInput;

/** All Prisma access for the `finance_transactions` collection. */
@Injectable()
export class FinanceTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<FinanceTransaction | null> {
    return this.prisma.financeTransaction.findFirst({ where: { id, ...LIVE } });
  }

  findBySourceKey(sourceKey: string): Promise<FinanceTransaction | null> {
    return this.prisma.financeTransaction.findUnique({ where: { sourceKey } });
  }

  /** Every live transaction for a set of orders — the backfill skips what's already posted. */
  findSourceKeys(sourceKeys: string[]): Promise<Array<{ sourceKey: string }>> {
    if (sourceKeys.length === 0) return Promise.resolve([]);
    return this.prisma.financeTransaction.findMany({
      where: { sourceKey: { in: sourceKeys } },
      select: { sourceKey: true },
    });
  }

  create(data: Prisma.FinanceTransactionUncheckedCreateInput): Promise<FinanceTransaction> {
    return this.prisma.financeTransaction.create({ data: { ...data, deletedAt: null } });
  }

  /**
   * Idempotent insert keyed by `sourceKey @unique`: a concurrent duplicate (two gateway
   * callbacks, a re-run backfill) hits P2002 and gets `null` instead of a second posting.
   */
  async createOnce(
    data: Prisma.FinanceTransactionUncheckedCreateInput,
  ): Promise<FinanceTransaction | null> {
    try {
      return await this.prisma.financeTransaction.create({ data: { ...data, deletedAt: null } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  update(
    id: string,
    data: Prisma.FinanceTransactionUncheckedUpdateInput,
  ): Promise<FinanceTransaction> {
    return this.prisma.financeTransaction.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.financeTransaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  paginate(
    where: Prisma.FinanceTransactionWhereInput,
    skip: number,
    take: number,
  ): Promise<[FinanceTransaction[], number]> {
    const w = { ...where, ...LIVE };
    return Promise.all([
      this.prisma.financeTransaction.findMany({
        where: w,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.financeTransaction.count({ where: w }),
    ]);
  }

  /** Unpaginated, oldest first — CSV export and the P&L (bounded by a date range). */
  findAll(
    where: Prisma.FinanceTransactionWhereInput,
    limit: number,
  ): Promise<FinanceTransaction[]> {
    return this.prisma.financeTransaction.findMany({
      where: { ...where, ...LIVE },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  /** Σ amount per (type, source, category) — the P&L building block. */
  sumByCategory(where: Prisma.FinanceTransactionWhereInput) {
    return this.prisma.financeTransaction.groupBy({
      by: ['type', 'source', 'categoryId'],
      where: { ...where, ...LIVE },
      _sum: { amount: true },
    });
  }

  /** Narrow rows for bucketing / COGS — no descriptions, bounded by `limit`. */
  findLite(where: Prisma.FinanceTransactionWhereInput, limit: number) {
    return this.prisma.financeTransaction.findMany({
      where: { ...where, ...LIVE },
      select: { occurredAt: true, type: true, source: true, amount: true, orderId: true },
      orderBy: { occurredAt: 'asc' },
      take: limit,
    });
  }

  /** Σ amount per type for a filter (income / expense / transfer). */
  async sumByType(
    where: Prisma.FinanceTransactionWhereInput,
  ): Promise<Record<FinanceTxnType, number>> {
    const rows = await this.prisma.financeTransaction.groupBy({
      by: ['type'],
      where: { ...where, ...LIVE },
      _sum: { amount: true },
    });
    const out: Record<FinanceTxnType, number> = { income: 0, expense: 0, transfer: 0 };
    for (const r of rows) out[r.type] = r._sum.amount ?? 0;
    return out;
  }

  /** Σ amount per (account, type) — outgoing side (`accountId`). */
  groupByAccount() {
    return this.prisma.financeTransaction.groupBy({
      by: ['accountId', 'type'],
      where: LIVE,
      _sum: { amount: true },
    });
  }

  /** Σ incoming transfers per destination account. */
  async sumTransfersIn(): Promise<Map<string, number>> {
    const rows = await this.prisma.financeTransaction.groupBy({
      by: ['toAccountId'],
      where: { ...LIVE, type: 'transfer', toAccountId: { not: null } },
      _sum: { amount: true },
    });
    return new Map(
      rows
        .filter((r): r is typeof r & { toAccountId: string } => r.toAccountId !== null)
        .map((r) => [r.toAccountId, r._sum.amount ?? 0]),
    );
  }

  /** Any transaction (deleted ones included) still pointing at an account / category. */
  async isAccountUsed(accountId: string): Promise<boolean> {
    const n = await this.prisma.financeTransaction.count({
      where: { OR: [{ accountId }, { toAccountId: accountId }] },
    });
    return n > 0;
  }

  async isCategoryUsed(categoryId: string): Promise<boolean> {
    return (await this.prisma.financeTransaction.count({ where: { categoryId } })) > 0;
  }
}
