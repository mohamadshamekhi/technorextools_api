import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';
import { persianZodErrorMap } from './zod-persian.error-map';

/**
 * Validates a request payload against a Zod schema and returns the parsed value.
 * On failure throws a 400 whose body carries a `fieldErrors` map — the shape the
 * storefront's BFF expects. All validation messages are Persian: schemas keep
 * their own texts, and anything without a custom message falls back to the
 * shared Persian error map.
 *
 * The schema's input side is `unknown` so schemas with `.default()`/`.transform()`
 * (whose input type differs from their output type) are accepted too.
 *
 *   @Body(new ZodValidationPipe(loginSchema)) body: LoginInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value, { errorMap: persianZodErrorMap });
    if (result.success) {
      return result.data;
    }
    const flattened = result.error.flatten();
    throw new BadRequestException({
      message: 'اعتبارسنجی ورودی ناموفق بود',
      fieldErrors: flattened.fieldErrors,
      formErrors: flattened.formErrors,
    });
  }
}
