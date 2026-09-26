import { z } from 'zod';

/** Iranian mobile: `09xxxxxxxxx` (also accepts `+989…` / `00989…` / `9…`). */
export const mobileSchema = z
  .string()
  .trim()
  .regex(/^(\+98|0098|98|0)?9\d{9}$/, 'شماره موبایل معتبر نیست');

export const otpRequestSchema = z.object({
  mobile: mobileSchema,
  referralCode: z
    .string()
    .trim()
    .min(4)
    .max(16)
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  mobile: mobileSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'کد باید ۵ رقم باشد'),
  /** Optional guest cart token (`X-Cart-Token`) to merge into the user's cart on login. */
  cartToken: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'حداقل یک فیلد باید ارسال شود');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
