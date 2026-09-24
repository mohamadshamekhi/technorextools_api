import { z } from 'zod';

export const storefrontListSparePartsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Only parts declared compatible with this product (slug). */
  productSlug: z.string().trim().max(160).optional(),
  inStock: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(60).default(20),
});
export type StorefrontListSparePartsQuery = z.infer<typeof storefrontListSparePartsQuerySchema>;
