import { DiscountAmountType, DiscountKind, DiscountTargetType } from '@prisma/client';
import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

const targetSchema = z.object({
  targetType: z.nativeEnum(DiscountTargetType),
  targetId: objectId,
});

export const createDiscountSchema = z
  .object({
    code: z.string().trim().min(3).max(40).toUpperCase(),
    kind: z.nativeEnum(DiscountKind),
    amountType: z.nativeEnum(DiscountAmountType),
    value: z.number().int().positive(),
    maxUsageTotal: z.number().int().positive().nullable().default(null),
    maxUsagePerUser: z.number().int().positive().nullable().default(null),
    minOrderAmount: z.number().int().positive().nullable().default(null),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    isActive: z.boolean().default(true),
    targets: z.array(targetSchema).max(200).default([]),
  })
  .refine((d) => d.amountType !== 'percent' || d.value <= 100, {
    message: 'درصد تخفیف باید بین ۱ تا ۱۰۰ باشد',
    path: ['value'],
  });
export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;

export const updateDiscountSchema = createDiscountSchema.innerType().partial();
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

export const listDiscountsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListDiscountsQuery = z.infer<typeof listDiscountsQuerySchema>;
