import type { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

function run(schema: z.ZodType<unknown, z.ZodTypeDef, unknown>, value: unknown): never {
  return new ZodValidationPipe(schema).transform(value) as never;
}

describe('ZodValidationPipe (Persian messages)', () => {
  it('returns the parsed value on success', () => {
    const schema = z.object({ mobile: z.string() });
    expect(new ZodValidationPipe(schema).transform({ mobile: '09120000000' })).toEqual({
      mobile: '09120000000',
    });
  });

  it('translates a null value into Persian', () => {
    const schema = z.object({ referralCode: z.string() });
    try {
      run(schema, { referralCode: null });
      fail('expected BadRequestException');
    } catch (e) {
      const err = e as BadRequestException;
      const body = err.getResponse() as { message: string; fieldErrors: Record<string, string[]> };
      expect(body.message).toBe('اعتبارسنجی ورودی ناموفق بود');
      expect(body.fieldErrors.referralCode).toEqual(['این فیلد نمی‌تواند خالی باشد']);
    }
  });

  it('translates a missing field into Persian', () => {
    const schema = z.object({ mobile: z.string() });
    try {
      run(schema, {});
      fail('expected BadRequestException');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as {
        fieldErrors: Record<string, string[]>;
      };
      expect(body.fieldErrors.mobile).toEqual(['این فیلد الزامی است']);
    }
  });

  it('translates enum and range failures into Persian', () => {
    const schema = z.object({
      sort: z.enum(['newest', 'price-asc']),
      take: z.number().int().min(1).max(100),
    });
    try {
      run(schema, { sort: 'nope', take: 0 });
      fail('expected BadRequestException');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as {
        fieldErrors: Record<string, string[]>;
      };
      expect(body.fieldErrors.sort).toEqual(['یکی از این مقادیر باید باشد: newest، price-asc']);
      expect(body.fieldErrors.take).toEqual(['باید 1 یا بیشتر باشد']);
    }
  });

  it('keeps the schema’s own Persian message instead of the default', () => {
    const schema = z.object({
      slug: z
        .string()
        .regex(/^[a-z0-9-]+$/, 'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد'),
    });
    try {
      run(schema, { slug: 'ABC!' });
      fail('expected BadRequestException');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as {
        fieldErrors: Record<string, string[]>;
      };
      expect(body.fieldErrors.slug).toEqual([
        'اسلاگ باید فقط شامل حروف کوچک انگلیسی، عدد و خط تیره باشد',
      ]);
    }
  });
});
