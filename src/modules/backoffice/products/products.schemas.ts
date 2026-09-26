import { z } from 'zod';
import { ProductDocumentType } from '@prisma/client';
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
  isFeatured: boolQueryParam,
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
  isFeatured: z.boolean().default(false),
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
    isFeatured: z.boolean(),
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

const percentSchema = z
  .number()
  .min(0, 'مختصات باید بین ۰ تا ۱۰۰ باشد')
  .max(100, 'مختصات باید بین ۰ تا ۱۰۰ باشد');

export const replacePartsSchema = z.object({
  parts: z
    .array(
      z.object({
        number: z.number().int().min(1, 'شماره قطعه باید عدد صحیح مثبت باشد'),
        name: z.string().trim().min(1, 'نام قطعه الزامی است').max(200),
        code: z.string().trim().min(1, 'کد قطعه الزامی است').max(60),
        sellable: z.boolean().default(false),
        hotspot: z.object({ x: percentSchema, y: percentSchema }).nullable().optional(),
      }),
    )
    .max(300),
});
export type ReplacePartsInput = z.infer<typeof replacePartsSchema>;

export const replaceHighlightsSchema = z.object({
  highlights: z
    .array(
      z.object({
        icon: z.string().trim().min(1, 'کلید آیکون الزامی است').max(40),
        value: z.string().trim().min(1, 'مقدار الزامی است').max(60),
        label: z.string().trim().min(1, 'برچسب الزامی است').max(60),
      }),
    )
    .max(12),
});
export type ReplaceHighlightsInput = z.infer<typeof replaceHighlightsSchema>;

export const replaceModel3dHotspotsSchema = z.object({
  hotspots: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .min(1, 'کلید نقطه الزامی است')
          .max(40)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'کلید فقط حروف کوچک انگلیسی، عدد و خط تیره'),
        label: z.string().trim().min(1, 'برچسب الزامی است').max(80),
        description: z.string().trim().max(400).nullable().optional(),
        // Model-space coordinates — unlike `parts.hotspot` these are not percentages.
        position: z.tuple([z.number(), z.number(), z.number()]),
      }),
    )
    .max(50),
});
export type ReplaceModel3dHotspotsInput = z.infer<typeof replaceModel3dHotspotsSchema>;

const documentTypeSchema = z.nativeEnum(ProductDocumentType);

export const createProductDocumentSchema = z.object({
  mediaId: objectIdSchema,
  type: documentTypeSchema,
  title: z.string().trim().min(1, 'عنوان سند الزامی است').max(200),
  locale: z.string().trim().min(2).max(10).default('fa'),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CreateProductDocumentInput = z.infer<typeof createProductDocumentSchema>;

export const updateProductDocumentSchema = createProductDocumentSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateProductDocumentInput = z.infer<typeof updateProductDocumentSchema>;

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

export const bulkUpdatePriceSchema = z
  .object({
    brandId: objectIdSchema,
    categoryId: objectIdSchema,
    productIds: z.array(objectIdSchema).min(1).max(500),
    mode: z.enum(['fixed', 'percent']),
    direction: z.enum(['increase', 'decrease']),
    value: z.coerce.number().positive('مقدار باید بزرگ‌تر از صفر باشد'),
  })
  .partial({ brandId: true, categoryId: true, productIds: true })
  .refine((v) => [v.brandId, v.categoryId, v.productIds].filter(Boolean).length === 1, {
    message: 'دقیقاً یکی از brandId، categoryId یا productIds باید مشخص شود',
    path: ['brandId'],
  })
  .refine((v) => !(v.mode === 'percent' && v.direction === 'decrease' && v.value > 100), {
    message: 'درصد کاهش نمی‌تواند بیشتر از ۱۰۰ باشد',
    path: ['value'],
  });
export type BulkUpdatePriceInput = z.infer<typeof bulkUpdatePriceSchema>;

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
