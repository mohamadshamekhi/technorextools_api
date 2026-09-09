import { z } from 'zod';

const objectIdSchema = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');
const tomanSchema = z.coerce.number().int().min(0, 'قیمت نمی‌تواند منفی باشد');

export const listVariantsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  productId: objectIdSchema.optional(),
  search: z.string().trim().min(1).max(64).optional(), // matches sku
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListVariantsQuery = z.infer<typeof listVariantsQuerySchema>;

export const updateInventoryVariantSchema = z
  .object({
    stockQty: z.coerce.number().int().min(0, 'موجودی نمی‌تواند منفی باشد'),
    priceOverride: tomanSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateInventoryVariantInput = z.infer<typeof updateInventoryVariantSchema>;

export const replacePriceTiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        minQty: z.coerce.number().int().min(2, 'حداقل تعداد باید ۲ یا بیشتر باشد'),
        unitPrice: tomanSchema,
      }),
    )
    .max(50),
});
export type ReplacePriceTiersInput = z.infer<typeof replacePriceTiersSchema>;
