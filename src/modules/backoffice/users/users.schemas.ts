import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(), // matches mobile / fullName / email
  roleId: z.string().length(24).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).nullable(),
    email: z.string().email().nullable(),
    roleId: z.string().length(24),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'فیلدی برای تغییر ارسال نشده' });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createUserSchema = z.object({
  mobile: z
    .string()
    .trim()
    .regex(/^(?:0|0098|\+98)?9\d{9}$/, 'شماره موبایل نامعتبر است'),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).nullable().default(null),
  roleId: z.string().length(24),
  isActive: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
