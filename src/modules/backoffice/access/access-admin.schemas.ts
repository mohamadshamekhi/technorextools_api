import { z } from 'zod';
import { ALL_PERMISSION_CODES } from '../../access/permission.catalog';

const permissionCode = z.enum(ALL_PERMISSION_CODES as [string, ...string[]], {
  message: 'کد مجوز نامعتبر است',
});

export const createRoleSchema = z.object({
  title: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_-]{1,30}$/, 'اسلاگ باید با حروف کوچک انگلیسی باشد'),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionCode).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    title: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).nullable(),
    permissions: z.array(permissionCode),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
