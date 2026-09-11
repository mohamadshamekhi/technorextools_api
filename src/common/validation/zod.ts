import { z } from 'zod';

/**
 * An optional input that also tolerates an explicit `null` from the client —
 * `null` is treated as "not provided" (→ `undefined`), never a type error. Use
 * for optional fields the storefront/backoffice BFF may serialise as `null`.
 *
 *   alt: optionalNullable(z.string().trim().max(300))
 */
export function optionalNullable<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .nullish()
    .transform((v): z.output<T> | undefined => (v == null ? undefined : (v as z.output<T>)));
}

/**
 * Like a plain `.default()` field, but an explicit `null` also falls back to the
 * default instead of erroring.
 *
 *   purpose: defaultedNullable(z.nativeEnum(MediaPurpose), MediaPurpose.ATTACHMENT)
 */
export function defaultedNullable<T extends z.ZodTypeAny>(schema: T, fallback: z.input<T>) {
  return z.preprocess((v) => (v == null ? undefined : v), schema.default(fallback as never));
}
