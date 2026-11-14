import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceTxnSource,
  FinanceTxnType,
  OrderStatus,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceTransaction,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccountingPostingService } from '../../accounting/accounting-posting.service';
import { FinanceAccountRepository } from '../../accounting/repositories/finance-account.repository';
import { FinanceCategoryRepository } from '../../accounting/repositories/finance-category.repository';
import { FinanceTransactionRepository } from '../../accounting/repositories/finance-transaction.repository';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { jalaliDate, jalaliMonth, toCsv } from './accounting.format';
import {
  checkTxnShape,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type ListCategoriesQuery,
  type ListTransactionsQuery,
  type ProfitLossQuery,
  type UpdateAccountInput,
  type UpdateCategoryInput,
  type UpdateTransactionInput,
} from './accounting.schemas';

const EXPORT_LIMIT = 20_000;
const SERIES_LIMIT = 100_000;
const BACKFILL_PAGE = 200;
const ORDER_ID_CHUNK = 500;

const TYPE_FA: Record<FinanceTxnType, string> = {
  income: 'درآمد',
  expense: 'هزینه',
  transfer: 'انتقال',
};
const SOURCE_FA: Record<FinanceTxnSource, string> = {
  manual: 'دستی',
  order_sale: 'فروش سفارش',
  order_refund: 'برگشت سفارش',
};

export interface FinanceAccountView {
  id: string;
  title: string;
  kind: FinanceAccount['kind'];
  accountNumber: string | null;
  openingBalance: number;
  /** openingBalance + income − expense − transfers out + transfers in. */
  balance: number;
  salesPaymentMethod: FinanceAccount['salesPaymentMethod'];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface FinanceCategoryView {
  id: string;
  title: string;
  type: FinanceCategory['type'];
  affectsProfit: boolean;
  isSystem: boolean;
  systemKey: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface FinanceTransactionView {
  id: string;
  type: FinanceTxnType;
  source: FinanceTxnSource;
  amount: number;
  occurredAt: string;
  description: string | null;
  reference: string | null;
  account: { id: string; title: string } | null;
  toAccount: { id: string; title: string } | null;
  category: { id: string; title: string; type: FinanceTxnType } | null;
  orderId: string | null;
  orderNumber: string | null;
  /** Only manual entries can be edited / deleted — order postings follow the order. */
  editable: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoryAmount {
  categoryId: string | null;
  title: string;
  amount: number;
}

export interface ProfitLossView {
  from: string;
  to: string;
  sales: { gross: number; refunds: number; net: number; orderCount: number };
  cogs: { amount: number; linesWithoutCost: number };
  grossProfit: number;
  otherIncome: { total: number; byCategory: CategoryAmount[] };
  expenses: { total: number; byCategory: CategoryAmount[] };
  netProfit: number;
  /** Money that moved but is outside the P&L (e.g. buying stock). */
  nonProfitExpenses: { total: number; byCategory: CategoryAmount[] };
  nonProfitIncome: { total: number; byCategory: CategoryAmount[] };
  cashFlow: {
    granularity: 'day' | 'month';
    buckets: Array<{ key: string; income: number; expense: number; net: number }>;
  };
}

@Injectable()
export class BackofficeAccountingService {
  constructor(
    private readonly accounts: FinanceAccountRepository,
    private readonly categories: FinanceCategoryRepository,
    private readonly txns: FinanceTransactionRepository,
    private readonly posting: AccountingPostingService,
    private readonly orders: OrderRepository,
  ) {}

  // ─── accounts ─────────────────────────────────────────────────────────────

  async listAccounts(): Promise<FinanceAccountView[]> {
    const [rows, outgoing, incoming] = await Promise.all([
      this.accounts.findMany(),
      this.txns.groupByAccount(),
      this.txns.sumTransfersIn(),
    ]);
    const delta = new Map<string, number>();
    for (const g of outgoing) {
      const sign = g.type === FinanceTxnType.income ? 1 : -1;
      delta.set(g.accountId, (delta.get(g.accountId) ?? 0) + sign * (g._sum.amount ?? 0));
    }
    for (const [id, amount] of incoming) delta.set(id, (delta.get(id) ?? 0) + amount);
    return rows.map((a) => toAccountView(a, a.openingBalance + (delta.get(a.id) ?? 0)));
  }

  async createAccount(input: CreateAccountInput): Promise<FinanceAccountView> {
    const created = await this.accounts.create({
      title: input.title,
      kind: input.kind,
      accountNumber: input.accountNumber ?? null,
      openingBalance: input.openingBalance,
      salesPaymentMethod: input.salesPaymentMethod ?? null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });
    if (created.salesPaymentMethod) {
      await this.accounts.clearSalesPaymentMethod(created.salesPaymentMethod, created.id);
    }
    return this.accountView(created.id);
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<FinanceAccountView> {
    await this.requireAccount(id);
    const updated = await this.accounts.update(id, {
      ...input,
      ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber ?? null } : {}),
      ...(input.salesPaymentMethod !== undefined
        ? { salesPaymentMethod: input.salesPaymentMethod ?? null }
        : {}),
    });
    if (input.salesPaymentMethod) {
      await this.accounts.clearSalesPaymentMethod(input.salesPaymentMethod, id);
    }
    return this.accountView(updated.id);
  }

  async removeAccount(id: string): Promise<void> {
    await this.requireAccount(id);
    if (await this.txns.isAccountUsed(id)) {
      throw new ConflictException('این حساب تراکنش دارد؛ به‌جای حذف، آن را غیرفعال کنید');
    }
    await this.accounts.delete(id);
  }

  private async accountView(id: string): Promise<FinanceAccountView> {
    const view = (await this.listAccounts()).find((a) => a.id === id);
    if (!view) throw new NotFoundException('حساب یافت نشد');
    return view;
  }

  private async requireAccount(id: string): Promise<FinanceAccount> {
    const account = await this.accounts.findById(id);
    if (!account) throw new NotFoundException('حساب یافت نشد');
    return account;
  }

  // ─── categories ───────────────────────────────────────────────────────────

  async listCategories(query: ListCategoriesQuery): Promise<FinanceCategoryView[]> {
    await this.posting.ensureSystemCategories();
    const rows = await this.categories.findMany(query.type ? { type: query.type } : {});
    return rows.map(toCategoryView);
  }

  async createCategory(input: CreateCategoryInput): Promise<FinanceCategoryView> {
    return toCategoryView(await this.categories.create({ ...input, systemKey: null }));
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<FinanceCategoryView> {
    const category = await this.requireCategory(id);
    if (category.systemKey && input.type && input.type !== category.type) {
      throw new BadRequestException('نوع دسته‌های سیستمی قابل تغییر نیست');
    }
    if (!category.systemKey && input.type && input.type !== category.type) {
      if (await this.txns.isCategoryUsed(id)) {
        throw new ConflictException('این دسته تراکنش دارد؛ نوع آن قابل تغییر نیست');
      }
    }
    return toCategoryView(await this.categories.update(id, input));
  }

  async removeCategory(id: string): Promise<void> {
    const category = await this.requireCategory(id);
    if (category.systemKey) throw new BadRequestException('دسته‌های سیستمی قابل حذف نیستند');
    if (await this.txns.isCategoryUsed(id)) {
      throw new ConflictException('این دسته تراکنش دارد؛ به‌جای حذف، آن را غیرفعال کنید');
    }
    await this.categories.delete(id);
  }

  private async requireCategory(id: string): Promise<FinanceCategory> {
    const category = await this.categories.findById(id);
    if (!category) throw new NotFoundException('دسته‌بندی یافت نشد');
    return category;
  }

  // ─── transactions ─────────────────────────────────────────────────────────

  async listTransactions(query: ListTransactionsQuery): Promise<{
    items: FinanceTransactionView[];
    total: number;
    skip: number;
    take: number;
    totals: Record<FinanceTxnType, number>;
  }> {
    const where = txnWhere(query);
    const [[rows, total], totals] = await Promise.all([
      this.txns.paginate(where, query.skip, query.take),
      this.txns.sumByType(where),
    ]);
    return {
      items: await this.toViews(rows),
      total,
      skip: query.skip,
      take: query.take,
      totals,
    };
  }

  async exportTransactionsCsv(query: ListTransactionsQuery): Promise<string> {
    const rows = await this.txns.findAll(txnWhere(query), EXPORT_LIMIT);
    const views = await this.toViews(rows);
    return toCsv([
      [
        'تاریخ',
        'نوع',
        'مبلغ (تومان)',
        'حساب',
        'حساب مقصد',
        'دسته',
        'منبع',
        'سفارش',
        'شرح',
        'شماره مرجع',
      ],
      ...views.map((v) => [
        jalaliDate(new Date(v.occurredAt)),
        TYPE_FA[v.type],
        v.amount,
        v.account?.title,
        v.toAccount?.title,
        v.category?.title,
        SOURCE_FA[v.source],
        v.orderNumber,
        v.description,
        v.reference,
      ]),
    ]);
  }

  async getTransaction(id: string): Promise<FinanceTransactionView> {
    return (await this.toViews([await this.requireTxn(id)]))[0]!;
  }

  async createTransaction(
    input: CreateTransactionInput,
    adminUserId: string,
  ): Promise<FinanceTransactionView> {
    const normalized = await this.validateRefs(input);
    const created = await this.txns.create({
      ...normalized,
      source: FinanceTxnSource.manual,
      description: input.description ?? null,
      reference: input.reference ?? null,
      sourceKey: `manual:${randomUUID()}`,
      createdByUserId: adminUserId,
    });
    return this.getTransaction(created.id);
  }

  async updateTransaction(
    id: string,
    input: UpdateTransactionInput,
  ): Promise<FinanceTransactionView> {
    const current = await this.requireManual(id);
    const merged = {
      type: input.type ?? current.type,
      amount: input.amount ?? current.amount,
      accountId: input.accountId ?? current.accountId,
      toAccountId: input.toAccountId !== undefined ? input.toAccountId : current.toAccountId,
      categoryId: input.categoryId !== undefined ? input.categoryId : current.categoryId,
      occurredAt: input.occurredAt ?? current.occurredAt,
    };
    const normalized = await this.validateRefs(merged);
    await this.txns.update(id, {
      ...normalized,
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.reference !== undefined ? { reference: input.reference ?? null } : {}),
    });
    return this.getTransaction(id);
  }

  async removeTransaction(id: string): Promise<void> {
    await this.requireManual(id);
    await this.txns.softDelete(id);
  }

  /**
   * Re-checks the cross-field rules on the (merged) row and that every referenced
   * account / category exists and fits the type. Returns the row with the field that
   * doesn't apply to its type nulled (a transfer has no category, income no destination).
   */
  private async validateRefs(v: {
    type: FinanceTxnType;
    amount: number;
    accountId: string;
    toAccountId?: string | null;
    categoryId?: string | null;
    occurredAt: Date;
  }): Promise<{
    type: FinanceTxnType;
    amount: number;
    accountId: string;
    toAccountId: string | null;
    categoryId: string | null;
    occurredAt: Date;
  }> {
    const issues: string[] = [];
    checkTxnShape(v, {
      addIssue: (i) => issues.push(i.message ?? 'نامعتبر'),
      path: [],
    });
    if (issues.length) throw new BadRequestException(issues[0]);

    const isTransfer = v.type === FinanceTxnType.transfer;
    const toAccountId = isTransfer ? (v.toAccountId ?? null) : null;
    const categoryId = isTransfer ? null : (v.categoryId ?? null);

    await this.requireAccount(v.accountId);
    if (toAccountId) await this.requireAccount(toAccountId);
    if (categoryId) {
      const category = await this.requireCategory(categoryId);
      if (category.type !== v.type) {
        throw new BadRequestException(
          v.type === FinanceTxnType.income
            ? 'برای درآمد باید یک دسته از نوع درآمد انتخاب شود'
            : 'برای هزینه باید یک دسته از نوع هزینه انتخاب شود',
        );
      }
    }
    return {
      type: v.type,
      amount: v.amount,
      accountId: v.accountId,
      toAccountId,
      categoryId,
      occurredAt: v.occurredAt,
    };
  }

  private async requireTxn(id: string): Promise<FinanceTransaction> {
    const txn = await this.txns.findById(id);
    if (!txn) throw new NotFoundException('تراکنش یافت نشد');
    return txn;
  }

  private async requireManual(id: string): Promise<FinanceTransaction> {
    const txn = await this.requireTxn(id);
    if (txn.source !== FinanceTxnSource.manual) {
      throw new ConflictException(
        'تراکنش‌های خودکار سفارش قابل ویرایش یا حذف نیستند؛ تغییر را از خود سفارش انجام دهید',
      );
    }
    return txn;
  }

  private async toViews(rows: FinanceTransaction[]): Promise<FinanceTransactionView[]> {
    const [accounts, categories] = await Promise.all([
      this.accounts.findMany(),
      this.categories.findByIds([
        ...new Set(rows.map((r) => r.categoryId).filter((c): c is string => !!c)),
      ]),
    ]);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const ref = (id: string | null) => {
      const a = id ? accountById.get(id) : undefined;
      return a ? { id: a.id, title: a.title } : null;
    };
    return rows.map((r) => {
      const c = r.categoryId ? categoryById.get(r.categoryId) : undefined;
      return {
        id: r.id,
        type: r.type,
        source: r.source,
        amount: r.amount,
        occurredAt: r.occurredAt.toISOString(),
        description: r.description,
        reference: r.reference,
        account: ref(r.accountId),
        toAccount: ref(r.toAccountId),
        category: c ? { id: c.id, title: c.title, type: c.type } : null,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        editable: r.source === FinanceTxnSource.manual,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  // ─── order backfill ───────────────────────────────────────────────────────

  /**
   * Posts every paid order's sale (and every paid-then-cancelled order's refund) that
   * isn't on the books yet — orders settled before accounting existed, or a posting
   * that failed at payment time. Idempotent; safe to re-run.
   */
  async syncOrders(): Promise<{ scanned: number; salesPosted: number; refundsPosted: number }> {
    let afterId: string | null = null;
    let scanned = 0;
    let salesPosted = 0;
    let refundsPosted = 0;
    for (;;) {
      const page = await this.orders.findPaidOrCancelledPage(afterId, BACKFILL_PAGE);
      if (page.length === 0) break;
      scanned += page.length;
      afterId = page[page.length - 1]!.id;

      for (const order of page) {
        const paidAt = order.statusHistory.find((h) => h.status === OrderStatus.paid)?.createdAt;
        // A cancelled order that never reached `paid` never took money.
        if (order.status === OrderStatus.cancelled && !paidAt) continue;
        if (await this.posting.recordSale(order, paidAt ?? order.placedAt)) salesPosted++;
        if (order.status === OrderStatus.cancelled) {
          const cancelledAt =
            order.statusHistory.filter((h) => h.status === OrderStatus.cancelled).at(-1)
              ?.createdAt ?? new Date();
          if (await this.posting.recordRefund(order, cancelledAt)) refundsPosted++;
        }
      }
      if (page.length < BACKFILL_PAGE) break;
    }
    return { scanned, salesPosted, refundsPosted };
  }

  // ─── profit & loss ────────────────────────────────────────────────────────

  async profitLoss(query: ProfitLossQuery): Promise<ProfitLossView> {
    const inRange: Prisma.FinanceTransactionWhereInput = {
      occurredAt: { gte: query.from, lte: query.to },
    };
    const [groups, lite] = await Promise.all([
      this.txns.sumByCategory(inRange),
      this.txns.findLite({ ...inRange, type: { not: FinanceTxnType.transfer } }, SERIES_LIMIT),
    ]);
    const categories = await this.categories.findByIds([
      ...new Set(groups.map((g) => g.categoryId).filter((c): c is string => !!c)),
    ]);
    const catById = new Map(categories.map((c) => [c.id, c]));

    let salesGross = 0;
    let refunds = 0;
    const otherIncome = new Map<string, CategoryAmount>();
    const expenses = new Map<string, CategoryAmount>();
    const nonProfitIncome = new Map<string, CategoryAmount>();
    const nonProfitExpenses = new Map<string, CategoryAmount>();
    for (const g of groups) {
      const amount = g._sum.amount ?? 0;
      if (g.source === FinanceTxnSource.order_sale) {
        salesGross += amount;
        continue;
      }
      if (g.source === FinanceTxnSource.order_refund) {
        refunds += amount;
        continue;
      }
      if (g.type === FinanceTxnType.transfer) continue;
      const cat = g.categoryId ? catById.get(g.categoryId) : undefined;
      const affects = cat?.affectsProfit ?? true;
      const bucket =
        g.type === FinanceTxnType.income
          ? affects
            ? otherIncome
            : nonProfitIncome
          : affects
            ? expenses
            : nonProfitExpenses;
      const key = g.categoryId ?? '__none__';
      const prev = bucket.get(key);
      bucket.set(key, {
        categoryId: g.categoryId,
        title: cat?.title ?? 'بدون دسته',
        amount: (prev?.amount ?? 0) + amount,
      });
    }

    // COGS: cost of goods on orders sold in range, minus goods on orders refunded in range.
    const soldIds = lite
      .filter((t) => t.source === FinanceTxnSource.order_sale && t.orderId)
      .map((t) => t.orderId!);
    const refundedIds = lite
      .filter((t) => t.source === FinanceTxnSource.order_refund && t.orderId)
      .map((t) => t.orderId!);
    const sold = await this.itemCost(soldIds);
    const returned = await this.itemCost(refundedIds);
    const cogs = sold.cost - returned.cost;

    const netSales = salesGross - refunds;
    const grossProfit = netSales - cogs;
    const other = summarize(otherIncome);
    const exp = summarize(expenses);

    return {
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      sales: {
        gross: salesGross,
        refunds,
        net: netSales,
        orderCount: new Set(soldIds).size,
      },
      cogs: { amount: cogs, linesWithoutCost: sold.missing },
      grossProfit,
      otherIncome: other,
      expenses: exp,
      netProfit: grossProfit + other.total - exp.total,
      nonProfitExpenses: summarize(nonProfitExpenses),
      nonProfitIncome: summarize(nonProfitIncome),
      cashFlow: bucketCashFlow(lite, query.from, query.to),
    };
  }

  async exportProfitLossCsv(query: ProfitLossQuery): Promise<string> {
    const r = await this.profitLoss(query);
    const rows: Array<Array<string | number | null>> = [
      ['گزارش سود و زیان', `${jalaliDate(query.from)} تا ${jalaliDate(query.to)}`],
      [],
      ['شرح', 'مبلغ (تومان)'],
      ['فروش سفارش‌ها', r.sales.gross],
      ['برگشت فروش', -r.sales.refunds],
      ['فروش خالص', r.sales.net],
      ['بهای تمام‌شده کالای فروش‌رفته', -r.cogs.amount],
      ['سود ناخالص', r.grossProfit],
      [],
      ['سایر درآمدها', r.otherIncome.total],
      ...r.otherIncome.byCategory.map((c) => [`  ${c.title}`, c.amount]),
      ['هزینه‌ها', -r.expenses.total],
      ...r.expenses.byCategory.map((c) => [`  ${c.title}`, -c.amount]),
      [],
      ['سود (زیان) خالص', r.netProfit],
    ];
    if (r.cogs.linesWithoutCost > 0) {
      rows.push([], [`${r.cogs.linesWithoutCost} قلم فروش‌رفته قیمت خرید ثبت‌شده ندارد`, null]);
    }
    if (r.nonProfitExpenses.total > 0) {
      rows.push(
        [],
        ['پرداخت‌های خارج از سود و زیان', -r.nonProfitExpenses.total],
        ...r.nonProfitExpenses.byCategory.map((c) => [`  ${c.title}`, -c.amount]),
      );
    }
    rows.push([], ['دوره', 'دریافت', 'پرداخت', 'خالص']);
    for (const b of r.cashFlow.buckets) rows.push([b.key, b.income, b.expense, b.net]);
    return toCsv(rows);
  }

  private async itemCost(orderIds: string[]): Promise<{ cost: number; missing: number }> {
    let cost = 0;
    let missing = 0;
    const unique = [...new Set(orderIds)];
    for (let i = 0; i < unique.length; i += ORDER_ID_CHUNK) {
      const items = await this.orders.findItemCosts(unique.slice(i, i + ORDER_ID_CHUNK));
      for (const it of items) {
        if (it.unitCost === null) missing++;
        else cost += it.unitCost * it.qty;
      }
    }
    return { cost, missing };
  }
}

function txnWhere(q: ListTransactionsQuery): Prisma.FinanceTransactionWhereInput {
  const and: Prisma.FinanceTransactionWhereInput[] = [];
  if (q.from || q.to) {
    and.push({
      occurredAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) },
    });
  }
  if (q.type) and.push({ type: q.type });
  if (q.source) and.push({ source: q.source });
  if (q.accountId) and.push({ OR: [{ accountId: q.accountId }, { toAccountId: q.accountId }] });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  if (q.q) {
    const contains = { contains: q.q, mode: 'insensitive' as const };
    and.push({
      OR: [{ description: contains }, { reference: contains }, { orderNumber: contains }],
    });
  }
  return and.length ? { AND: and } : {};
}

function summarize(m: Map<string, CategoryAmount>): {
  total: number;
  byCategory: CategoryAmount[];
} {
  const byCategory = [...m.values()].sort((a, b) => b.amount - a.amount);
  return { total: byCategory.reduce((s, c) => s + c.amount, 0), byCategory };
}

/** Daily buckets for ranges up to ~2 months, Jalali-month buckets beyond. Zero-filled. */
export function bucketCashFlow(
  rows: Array<{ occurredAt: Date; type: FinanceTxnType; amount: number }>,
  from: Date,
  to: Date,
): ProfitLossView['cashFlow'] {
  const granularity: 'day' | 'month' =
    to.getTime() - from.getTime() > 62 * 86_400_000 ? 'month' : 'day';
  const keyOf = granularity === 'day' ? jalaliDate : jalaliMonth;
  const buckets = new Map<string, { income: number; expense: number }>();
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
    buckets.set(keyOf(new Date(t)), { income: 0, expense: 0 });
  }
  buckets.set(keyOf(to), buckets.get(keyOf(to)) ?? { income: 0, expense: 0 });
  for (const r of rows) {
    const key = keyOf(r.occurredAt);
    const b = buckets.get(key) ?? { income: 0, expense: 0 };
    if (r.type === FinanceTxnType.income) b.income += r.amount;
    else if (r.type === FinanceTxnType.expense) b.expense += r.amount;
    buckets.set(key, b);
  }
  return {
    granularity,
    buckets: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        key,
        income: b.income,
        expense: b.expense,
        net: b.income - b.expense,
      })),
  };
}

function toAccountView(a: FinanceAccount, balance: number): FinanceAccountView {
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    accountNumber: a.accountNumber,
    openingBalance: a.openingBalance,
    balance,
    salesPaymentMethod: a.salesPaymentMethod,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
  };
}

function toCategoryView(c: FinanceCategory): FinanceCategoryView {
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    affectsProfit: c.affectsProfit,
    isSystem: c.systemKey !== null,
    systemKey: c.systemKey,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
  };
}
