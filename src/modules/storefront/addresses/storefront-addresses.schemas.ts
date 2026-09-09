import { z } from 'zod';

const iranMobile = z
  .string()
  .trim()
  .regex(/^09\d{9}$/, 'شماره موبایل نامعتبر است');

export const createAddressSchema = z.object({
  receiverName: z.string().trim().min(2).max(120),
  receiverMobile: iranMobile,
  province: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  fullAddress: z.string().trim().min(5).max(500),
  postalCode: z.string().trim().regex(/^\d{10}$/, 'کد پستی باید ۱۰ رقم باشد'),
  isDefault: z.boolean().default(false),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
