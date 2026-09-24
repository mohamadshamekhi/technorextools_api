import { z } from 'zod';
import { mobileSchema } from '../../auth/auth.schemas';

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'نام الزامی است').max(120),
  phone: z.string().trim().min(4, 'شماره تماس الزامی است').max(30),
  subject: z.string().trim().max(160).nullable().optional(),
  message: z.string().trim().min(10, 'متن پیام خیلی کوتاه است').max(4000),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

/** Newsletter accepts an email **or** an Iranian mobile. */
export const newsletterSchema = z.object({
  contact: z
    .string()
    .trim()
    .max(160)
    .refine(
      (v) => z.string().email().safeParse(v).success || mobileSchema.safeParse(v).success,
      'ایمیل یا شماره موبایل معتبر وارد کنید',
    ),
});
export type NewsletterInput = z.infer<typeof newsletterSchema>;
