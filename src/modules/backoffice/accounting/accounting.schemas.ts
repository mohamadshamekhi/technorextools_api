import {
  FinanceAccountKind,
  FinanceTxnSource,
  FinanceTxnType,
  PaymentMethodKind,
} from '@prisma/client';
import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'شناسه نامعتبر است');
const amount = z.coerce
  .number()
  .int('مبلغ باید عدد صحیح (تومان) باشد')
  .positive('مبلغ باید بزرگ‌تر از صفر باشد')
  .max(1_000_000_000_000, 'مبلغ بیش از حد مجاز است');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const MAX_RANGE_DAYS = 3 * 366;

// ─── accounts ───────────────────────────────────────────────────────────────

export const createAccountSchema = z.object({
  title: z.string().trim().min(2, 'عنوان کوتاه است').max(120),
  kind: z.nativeEnum(FinanceAccountKind),
  accountNumber: optionalText(64),
  openingBalance: z.coerce.number().int('موجودی اولیه باید عدد صحیح باشد').default(0),
  /** Paid orders with this payment method post their income to this account. */
  salesPaymentMethod: z.nativeEnum(PaymentMethodKind).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = createAccountSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ─── categories ─────────────────────────────────────────────────────────────

export const listCategoriesQuerySchema = z.object({
  type: z.enum([FinanceTxnType.income, FinanceTxnType.expense]).optional(),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export const createCategorySchema = z.object({
  title: z.string().trim().min(2, 'عنوان کوتاه است').max(120),
  type: z.enum([FinanceTxnType.income, FinanceTxnType.expense], {
    errorMap: () => ({ message: 'نوع دسته باید درآمد یا هزینه باشد' }),
  }),
  affectsProfit: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ─── transactions ───────────────────────────────────────────────────────────

const txnBase = z.object({
  type: z.nativeEnum(FinanceTxnType),
  amount,
  accountId: objectId,
  toAccountId: objectId.nullable().optional(),
  categoryId: objectId.nullable().optional(),
  occurredAt: z.coerce.date({ errorMap: () => ({ message: 'تاریخ نامعتبر است' }) }),
  description: optionalText(500),
  reference: optionalText(120),
});

/** Shape rules shared by create and the merged result of an update. */
export function checkTxnShape(
  v: {
    type?: FinanceTxnType;
    accountId?: string;
    toAccountId?: string | null;
    categoryId?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (v.type === FinanceTxnType.transfer) {
    if (!v.toAccountId) {
      ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'حساب مقصد الزامی است' });
    } else if (v.toAccountId === v.accountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['toAccountId'],
        message: 'حساب مبدأ و مقصد نمی‌توانند یکی باشند',
      });
    }
  } else if (v.type) {
    if (!v.categoryId) {
      ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'دسته‌بندی الزامی است' });
    }
  }
}

export const createTransactionSchema = txnBase.superRefine(checkTxnShape);
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = txnBase
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

const rangeFields = {
  from: z.coerce.date({ errorMap: () => ({ message: 'تاریخ شروع نامعتبر است' }) }).optional(),
  to: z.coerce.date({ errorMap: () => ({ message: 'تاریخ پایان نامعتبر است' }) }).optional(),
};

export const listTransactionsQuerySchema = z
  .object({
    ...rangeFields,
    type: z.nativeEnum(FinanceTxnType).optional(),
    source: z.nativeEnum(FinanceTxnSource).optional(),
    accountId: objectId.optional(),
    categoryId: objectId.optional(),
    q: z.string().trim().min(1).max(100).optional(),
    skip: z.coerce.number().int().min(0).default(0),
    take: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'تاریخ شروع باید قبل از تاریخ پایان باشد',
    path: ['from'],
  });
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

// ─── reports ────────────────────────────────────────────────────────────────

export const profitLossQuerySchema = z
  .object(rangeFields)
  .transform((v) => ({
    from: v.from ?? new Date(Date.now() - 30 * 86_400_000),
    to: v.to ?? new Date(),
  }))
  .superRefine((v, ctx) => {
    if (v.from > v.to) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'تاریخ شروع باید قبل از تاریخ پایان باشد',
      });
    } else if (v.to.getTime() - v.from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'بازه حداکثر ۳ سال است' });
    }
  });
export type ProfitLossQuery = z.infer<typeof profitLossQuerySchema>;
