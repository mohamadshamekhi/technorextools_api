import { z } from 'zod';
import { mediaManagedField, stripKey } from '../../../common/validation/zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد');

export const createBrandSchema = z
  .object({
    title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
    slug: slugSchema,
    isExclusiveDistributor: z.boolean().default(false),
    authenticityNote: z.string().trim().max(2000).nullable(),
    // Lives in `Media` (ownerType BRAND, purpose LOGO) — rejected, not ignored.
    logoUrl: mediaManagedField('LOGO', 'BRAND'),
  })
  .transform(stripKey('logoUrl'));
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    slug: slugSchema,
    isExclusiveDistributor: z.boolean(),
    authenticityNote: z.string().trim().max(2000).nullable(),
    logoUrl: mediaManagedField('LOGO', 'BRAND'),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' })
  .transform(stripKey('logoUrl'));
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/**
 * Bulk import — one crawled brand. Everything but `title` is optional so a
 * crawler can send what it actually found. `slug` is derived from the title
 * when omitted. `logoSourceUrl` is the **source site's** image URL: the API
 * downloads it and stores it as a `Media` row (this is not `logoUrl`, which
 * stays rejected on create/update).
 */
export const importBrandItemSchema = z.object({
  title: z.string().trim().min(1, 'عنوان الزامی است').max(120),
  slug: slugSchema.optional(),
  isExclusiveDistributor: z.boolean().optional(),
  authenticityNote: z.string().trim().max(2000).nullable().optional(),
  logoSourceUrl: z.string().trim().url('آدرس لوگو نامعتبر است').max(2000).nullable().optional(),
});
export type ImportBrandItemInput = z.infer<typeof importBrandItemSchema>;

export const importBrandsSchema = z.object({
  /** Free-text provenance label (the crawled site) — logged, not persisted. */
  source: z.string().trim().max(200).optional(),
  /** Validate and report without writing anything. */
  dryRun: z.boolean().default(false),
  /** Re-download the logo even when the brand already has one. */
  replaceLogo: z.boolean().default(false),
  brands: z
    .array(importBrandItemSchema)
    .min(1, 'حداقل یک برند باید ارسال شود')
    .max(200, 'حداکثر ۲۰۰ برند در هر درخواست'),
});
export type ImportBrandsInput = z.infer<typeof importBrandsSchema>;
