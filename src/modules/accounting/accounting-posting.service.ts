import { Injectable, Logger } from '@nestjs/common';
import {
  FinanceAccountKind,
  FinanceTxnSource,
  FinanceTxnType,
  PaymentMethodKind,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceTransaction,
} from '@prisma/client';
import { FinanceAccountRepository } from './repositories/finance-account.repository';
import { FinanceCategoryRepository } from './repositories/finance-category.repository';
import { FinanceTransactionRepository } from './repositories/finance-transaction.repository';

/** Categories the API posts to itself. Created lazily, can't be deleted or retyped. */
export const SYSTEM_CATEGORIES = {
  sales: { title: 'فروش سفارش‌ها', type: FinanceTxnType.income, affectsProfit: true },
  sales_refund: { title: 'برگشت فروش', type: FinanceTxnType.expense, affectsProfit: true },
  inventory_purchase: {
    title: 'خرید کالا (موجودی انبار)',
    type: FinanceTxnType.expense,
    // Stock bought is an asset; its cost hits the P&L as COGS when the goods sell.
    affectsProfit: false,
  },
} as const;
export type SystemCategoryKey = keyof typeof SYSTEM_CATEGORIES;

const DEFAULT_SALES_ACCOUNT: Record<
  PaymentMethodKind,
  { title: string; kind: FinanceAccountKind }
> = {
  [PaymentMethodKind.online]: { title: 'درگاه پرداخت آنلاین', kind: FinanceAccountKind.gateway },
  [PaymentMethodKind.cash]: { title: 'صندوق نقدی', kind: FinanceAccountKind.cash },
};

export interface SaleOrder {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod: PaymentMethodKind;
}

export const saleKey = (orderId: string): string => `sale:${orderId}`;
export const refundKey = (orderId: string): string => `refund:${orderId}`;

/**
 * Automatic postings from the order lifecycle: a paid order → one `order_sale` income on
 * the account mapped to its payment method; a paid order cancelled → one `order_refund`
 * expense mirroring it. Both are idempotent on `sourceKey`, so a duplicate callback or a
 * re-run backfill never double-posts.
 */
@Injectable()
export class AccountingPostingService {
  private readonly logger = new Logger('Accounting');

  constructor(
    private readonly accounts: FinanceAccountRepository,
    private readonly categories: FinanceCategoryRepository,
    private readonly txns: FinanceTransactionRepository,
  ) {}

  async systemCategory(key: SystemCategoryKey): Promise<FinanceCategory> {
    const existing = await this.categories.findBySystemKey(key);
    if (existing) return existing;
    const def = SYSTEM_CATEGORIES[key];
    return this.categories.create({
      title: def.title,
      type: def.type,
      affectsProfit: def.affectsProfit,
      systemKey: key,
    });
  }

  async ensureSystemCategories(): Promise<void> {
    for (const key of Object.keys(SYSTEM_CATEGORIES) as SystemCategoryKey[]) {
      await this.systemCategory(key);
    }
  }

  /** The account sales of `code` land in — created on first use so posting needs no setup. */
  async salesAccountFor(code: PaymentMethodKind): Promise<FinanceAccount> {
    const mapped = await this.accounts.findBySalesPaymentMethod(code);
    if (mapped) return mapped;
    const def = DEFAULT_SALES_ACCOUNT[code];
    return this.accounts.create({ title: def.title, kind: def.kind, salesPaymentMethod: code });
  }

  /** Returns the new posting, or null when it was already posted / nothing to post. */
  async recordSale(order: SaleOrder, occurredAt: Date): Promise<FinanceTransaction | null> {
    if (order.total <= 0) return null;
    if (await this.txns.findBySourceKey(saleKey(order.id))) return null;
    const [account, category] = await Promise.all([
      this.salesAccountFor(order.paymentMethod),
      this.systemCategory('sales'),
    ]);
    return this.txns.createOnce({
      type: FinanceTxnType.income,
      source: FinanceTxnSource.order_sale,
      amount: order.total,
      accountId: account.id,
      categoryId: category.id,
      occurredAt,
      description: `فروش سفارش ${order.orderNumber}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sourceKey: saleKey(order.id),
    });
  }

  /** Mirror of the order's sale posting; no sale posting → nothing was received → no refund. */
  async recordRefund(
    order: Pick<SaleOrder, 'id' | 'orderNumber'>,
    occurredAt: Date,
  ): Promise<FinanceTransaction | null> {
    const sale = await this.txns.findBySourceKey(saleKey(order.id));
    if (!sale || sale.deletedAt) return null;
    const category = await this.systemCategory('sales_refund');
    return this.txns.createOnce({
      type: FinanceTxnType.expense,
      source: FinanceTxnSource.order_refund,
      amount: sale.amount,
      accountId: sale.accountId,
      categoryId: category.id,
      occurredAt,
      description: `برگشت وجه سفارش لغوشده ${order.orderNumber}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sourceKey: refundKey(order.id),
    });
  }

  /**
   * Fire-from-the-order-lifecycle wrappers: accounting must never fail a payment or a
   * cancel that already happened, so errors are logged and left for the backfill
   * (`POST backoffice/accounting/sync-orders`) to repair.
   */
  async safeRecordSale(order: SaleOrder, occurredAt = new Date()): Promise<void> {
    try {
      await this.recordSale(order, occurredAt);
    } catch (err) {
      this.logger.error(`sale posting failed for order ${order.orderNumber}: ${String(err)}`);
    }
  }

  async safeRecordRefund(
    order: Pick<SaleOrder, 'id' | 'orderNumber'>,
    occurredAt = new Date(),
  ): Promise<void> {
    try {
      await this.recordRefund(order, occurredAt);
    } catch (err) {
      this.logger.error(`refund posting failed for order ${order.orderNumber}: ${String(err)}`);
    }
  }
}
