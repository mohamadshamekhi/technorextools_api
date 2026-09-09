import { z } from 'zod';

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'شناسه نامعتبر است');

export const storefrontListArticlesQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(12),
});
export type StorefrontListArticlesQuery = z.infer<typeof storefrontListArticlesQuerySchema>;

export const storefrontSeoQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(60), // e.g. "product", "category", "article", "page"
  entityId: objectIdSchema,
});
export type StorefrontSeoQuery = z.infer<typeof storefrontSeoQuerySchema>;

export const storefrontObjectIdParamSchema = objectIdSchema;
