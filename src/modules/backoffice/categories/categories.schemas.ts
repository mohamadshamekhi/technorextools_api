import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد');
const objectIdSchema = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');
const urlSchema = z.string().trim().url('آدرس تصویر معتبر نیست').max(2048);

export const createCategorySchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
  slug: slugSchema,
  imageUrl: urlSchema.nullable().default(null),
  parentId: objectIdSchema.optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    slug: slugSchema,
    imageUrl: urlSchema.nullable(),
    parentId: objectIdSchema.nullable(),
    sortOrder: z.coerce.number().int().min(0),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export const createAttributeGroupSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
});
export type CreateAttributeGroupInput = z.infer<typeof createAttributeGroupSchema>;

export const updateAttributeGroupSchema = z
  .object({ title: z.string().trim().min(1).max(120) })
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateAttributeGroupInput = z.infer<typeof updateAttributeGroupSchema>;

export const attributeInputTypeSchema = z.enum(['text', 'number', 'boolean', 'select'], {
  message: 'نوع ورودی نامعتبر است',
});

export const createAttributeSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
    unit: z.string().trim().max(30).nullable(),
    inputType: attributeInputTypeSchema.default('text'),
    options: z.array(z.string().trim().min(1)).default([]),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => v.inputType !== 'select' || v.options.length > 0, {
    message: 'برای نوع انتخابی، حداقل یک گزینه لازم است',
  });
export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;

export const updateAttributeSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    unit: z.string().trim().max(30).nullable(),
    inputType: attributeInputTypeSchema,
    options: z.array(z.string().trim().min(1)),
    sortOrder: z.coerce.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' })
  .refine((v) => v.inputType !== 'select' || (v.options !== undefined && v.options.length > 0), {
    message: 'برای نوع انتخابی، حداقل یک گزینه لازم است',
  });
export type UpdateAttributeInput = z.infer<typeof updateAttributeSchema>;
