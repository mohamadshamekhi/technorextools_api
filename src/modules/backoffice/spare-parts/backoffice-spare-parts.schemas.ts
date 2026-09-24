import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'شناسه نامعتبر است');
const slug = z
  .string()
  .trim()
  .min(2, 'اسلاگ کوتاه است')
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ نامعتبر است');

export const createSparePartSchema = z.object({
  title: z.string().trim().min(2, 'عنوان کوتاه است').max(200),
  slug,
  partNumber: z.string().trim().min(1).max(100).nullable().default(null),
  shortDesc: z.string().trim().max(500).nullable().default(null),
  description: z.string().trim().max(20000).nullable().default(null),
  price: z.number().int('قیمت باید عدد صحیح (تومان) باشد').positive('قیمت باید مثبت باشد'),
  stockQty: z.number().int().min(0).default(0),
  weightGrams: z.number().int().positive().nullable().default(null),
  isActive: z.boolean().default(true),
  /** Products this part fits (replaced wholesale on update). */
  productIds: z.array(objectId).max(500).default([]),
});
export type CreateSparePartInput = z.infer<typeof createSparePartSchema>;

export const updateSparePartSchema = createSparePartSchema.partial();
export type UpdateSparePartInput = z.infer<typeof updateSparePartSchema>;

export const listSparePartsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  productId: objectId.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListSparePartsQuery = z.infer<typeof listSparePartsQuerySchema>;

/** Product side: full set of spare parts a product uses (replace semantics). */
export const replaceProductSparePartsSchema = z.object({
  sparePartIds: z.array(objectId).max(500),
});
export type ReplaceProductSparePartsInput = z.infer<typeof replaceProductSparePartsSchema>;
