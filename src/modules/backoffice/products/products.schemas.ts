import { z } from 'zod';
import { optionalNullable } from '../../../common/validation/zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد');
const objectIdSchema = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');
const tomanSchema = z.coerce.number().int().min(0, 'قیمت نمی‌تواند منفی باشد');
const boolQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const listProductsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(), // matches title / slug
  categoryId: objectIdSchema.optional(),
  brandId: objectIdSchema.optional(),
  isActive: boolQueryParam,
  isAmazingDeal: boolQueryParam,
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const createProductSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(200),
  slug: slugSchema,
  categoryId: objectIdSchema,
  brandId: optionalNullable(objectIdSchema),
  shortDesc: z.string().trim().max(500).nullable(),
  description: z.string().trim().max(50000).nullable(),
  basePrice: tomanSchema,
  isAmazingDeal: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    slug: slugSchema,
    categoryId: objectIdSchema,
    brandId: objectIdSchema.nullable(),
    shortDesc: z.string().trim().max(500).nullable(),
    description: z.string().trim().max(50000).nullable(),
    basePrice: tomanSchema,
    isAmazingDeal: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const replaceAttributeValuesSchema = z.object({
  values: z
    .array(
      z.object({
        attributeId: objectIdSchema,
        value: z.string().trim().min(1, 'مقدار ویژگی الزامی است').max(500),
      }),
    )
    .max(100),
});
export type ReplaceAttributeValuesInput = z.infer<typeof replaceAttributeValuesSchema>;

export const replaceRelatedSchema = z.object({
  relatedProductIds: z.array(objectIdSchema).max(50),
});
export type ReplaceRelatedInput = z.infer<typeof replaceRelatedSchema>;

export const createVariantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'SKU الزامی است')
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, 'SKU فقط شامل حروف انگلیسی، عدد و خط تیره است'),
  colorName: z.string().trim().max(50).nullable(),
  stockQty: z.coerce.number().int().min(0, 'موجودی نمی‌تواند منفی باشد').default(0),
  priceOverride: tomanSchema.nullable(),
  weightGrams: z.coerce.number().int().min(0).nullable().default(null),
  isActive: z.boolean().default(true),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateProductVariantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9-]+$/, 'SKU فقط شامل حروف انگلیسی، عدد و خط تیره است'),
    colorName: z.string().trim().max(50).nullable(),
    weightGrams: z.coerce.number().int().min(0).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;
