import { z } from 'zod';
import { MediaOwnerType, MediaPurpose } from '@prisma/client';
import { defaultedNullable, optionalNullable } from '../../common/validation/zod';

const objectId = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');
const boolFromForm = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

/**
 * `multipart/form-data` — the `file` part is read by the interceptor, not this
 * schema. Every non-file field is optional; an explicit `null` is treated the
 * same as omitting it.
 */
export const uploadMediaSchema = z
  .object({
    ownerType: optionalNullable(z.nativeEnum(MediaOwnerType)),
    ownerId: optionalNullable(objectId),
    purpose: defaultedNullable(z.nativeEnum(MediaPurpose), MediaPurpose.ATTACHMENT),
    alt: optionalNullable(z.string().trim().max(300)),
    isMain: optionalNullable(boolFromForm),
    sortOrder: optionalNullable(z.coerce.number().int().min(0).max(9999)),
    folder: optionalNullable(z.string().trim().max(40)),
  })
  .refine((v) => (v.ownerType === undefined) === (v.ownerId === undefined), {
    message: 'ownerType و ownerId باید با هم بیایند',
    path: ['ownerId'],
  });
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;

export const listMediaQuerySchema = z.object({
  ownerType: z.nativeEnum(MediaOwnerType),
  ownerId: objectId,
});
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;

/**
 * `alt` keeps its `null` (an explicit `null` clears the caption); the other
 * fields treat `null` as "not provided".
 */
export const updateMediaSchema = z
  .object({
    purpose: optionalNullable(z.nativeEnum(MediaPurpose)),
    alt: z.string().trim().max(300).nullable().optional(),
    isMain: optionalNullable(z.boolean()),
    sortOrder: optionalNullable(z.number().int().min(0).max(9999)),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'فیلدی برای تغییر ارسال نشده',
  });
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;
