import { z } from 'zod';

export const storefrontWarrantyVerifyQuerySchema = z.object({
  serial: z.string().trim().min(1).max(120),
});
export type StorefrontWarrantyVerifyQuery = z.infer<typeof storefrontWarrantyVerifyQuerySchema>;
