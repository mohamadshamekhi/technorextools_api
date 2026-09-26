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

/**
 * A field whose value lives in `Media`, not on the row (article cover, brand logo,
 * SEO og:image). Clients used to send it and get a silent 200 with nothing saved, so
 * it is declared and rejected with a message pointing at the upload endpoint.
 * Pair with `stripKey` so the parsed output carries no trace of it.
 */
export function mediaManagedField(purpose: string, ownerType: string) {
  return z
    .never({
      invalid_type_error: `این فیلد پذیرفته نمی‌شود؛ تصویر را با POST /backoffice/media/upload و ownerType=${ownerType} و purpose=${purpose} آپلود کنید`,
    })
    .optional();
}

/** Drop one key from a parsed object — used as a Zod `.transform()`. */
export function stripKey<K extends string>(key: K) {
  return <T extends Record<string, unknown>>(value: T): Omit<T, K> => {
    const rest = { ...value };
    delete rest[key];
    return rest;
  };
}
