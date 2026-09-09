import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد');
const urlSchema = z.string().trim().url('آدرس تصویر معتبر نیست').max(2048);

export const createBrandSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
  slug: slugSchema,
  logoUrl: urlSchema.nullable(),
  isExclusiveDistributor: z.boolean().default(false),
  authenticityNote: z.string().trim().max(2000).nullable(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    slug: slugSchema,
    logoUrl: urlSchema.nullable(),
    isExclusiveDistributor: z.boolean(),
    authenticityNote: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
