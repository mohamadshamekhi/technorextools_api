import { z } from 'zod';

const slug = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره');

export const createArticleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug,
  coverImage: z.string().url().max(500).nullable().default(null),
  excerpt: z.string().trim().max(500).nullable().default(null),
  body: z.string().min(1),
  publishedAt: z.coerce.date().nullable().default(null),
});
export const updateArticleSchema = createArticleSchema.partial();
export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export const createBranchSchema = z.object({
  title: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(500),
  phone: z.string().trim().min(4).max(40),
  workingHours: z.string().trim().max(200).nullable().default(null),
  isWholesalePoint: z.boolean().default(false),
});
export const updateBranchSchema = createBranchSchema.partial();
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const upsertSeoSchema = z.object({
  entityType: z.string().trim().min(1).max(60),
  entityId: z.string().regex(/^[a-f0-9]{24}$/i),
  metaTitle: z.string().trim().max(200).nullable().default(null),
  metaDescription: z.string().trim().max(400).nullable().default(null),
  ogImage: z.string().url().max(500).nullable().default(null),
  canonicalUrl: z.string().url().max(500).nullable().default(null),
});
export type UpsertSeoInput = z.infer<typeof upsertSeoSchema>;

export const listArticlesQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
