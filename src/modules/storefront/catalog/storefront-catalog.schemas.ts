import { z } from 'zod';

const objectIdSchema = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');

export const storefrontListProductsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(), // matches title
  category: z.string().trim().min(1).max(120).optional(), // category slug — the filter includes all descendant categories
  brand: z.string().trim().min(1).max(120).optional(), // brand slug
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  isAmazingDeal: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  isFeatured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sort: z.enum(['newest', 'price-asc', 'price-desc']).default('newest'),
  // Faceted filter — pairs of <attributeId>:<value>, e.g. attrs=66f1..:500,66f2..:Red
  attrs: z
    .string()
    .max(2000)
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined) return undefined;
      const pairs: Array<{ attributeId: string; value: string }> = [];
      for (const part of raw.split(',')) {
        const separatorIndex = part.indexOf(':');
        if (separatorIndex === -1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'قالب فیلتر ویژگی نامعتبر است' });
          return z.NEVER;
        }
        const attributeId = part.slice(0, separatorIndex);
        const value = part.slice(separatorIndex + 1);
        if (!/^[a-f0-9]{24}$/i.test(attributeId) || value.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'قالب فیلتر ویژگی نامعتبر است' });
          return z.NEVER;
        }
        pairs.push({ attributeId: attributeId.toLowerCase(), value });
      }
      return pairs;
    }),
});
export type StorefrontListProductsQuery = z.infer<typeof storefrontListProductsQuerySchema>;

export const storefrontObjectIdParamSchema = objectIdSchema;

export const storefrontListCommentsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(10),
});
export type StorefrontListCommentsQuery = z.infer<typeof storefrontListCommentsQuerySchema>;

export const storefrontCreateCommentSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(3).max(2000),
});
export type StorefrontCreateCommentInput = z.infer<typeof storefrontCreateCommentSchema>;

export const storefrontCreateQuestionSchema = z.object({
  question: z.string().trim().min(5, 'متن پرسش خیلی کوتاه است').max(1000),
});
export type StorefrontCreateQuestionInput = z.infer<typeof storefrontCreateQuestionSchema>;
