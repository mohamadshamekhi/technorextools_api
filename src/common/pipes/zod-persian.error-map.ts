import type { ZodErrorMap } from 'zod';

const typeName: Record<string, string> = {
  string: 'متن',
  number: 'عدد',
  bigint: 'عدد صحیح بزرگ',
  boolean: 'true/false',
  date: 'تاریخ',
  array: 'آرایه',
  object: 'شیء',
  symbol: 'نماد',
  null: 'null',
  undefined: 'undefined',
};

/**
 * Fills in Persian messages for every Zod failure that a schema did not give a
 * custom message of its own. Schemas keep their own Persian texts: when an
 * issue already carries a `message` (from the schema), it is returned as-is.
 * Used by `ZodValidationPipe` so no English validation text reaches users.
 */
export const persianZodErrorMap: ZodErrorMap = (issue, ctx) => {
  if (typeof issue.message === 'string' && issue.message.length > 0) {
    return { message: issue.message };
  }
  switch (issue.code) {
    case 'invalid_type':
      if (issue.received === 'null') return { message: 'این فیلد نمی‌تواند خالی باشد' };
      if (issue.received === 'undefined') return { message: 'این فیلد الزامی است' };
      if (issue.received === 'nan') return { message: 'عدد معتبر نیست' };
      return { message: `مقدار باید ${typeName[issue.expected] ?? 'معتبر'} باشد` };
    case 'too_small': {
      if (issue.type === 'string') {
        return { message: `حداقل ${issue.minimum} کاراکتر لازم است` };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return issue.inclusive
          ? { message: `باید ${issue.minimum} یا بیشتر باشد` }
          : { message: `باید بیشتر از ${issue.minimum} باشد` };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return { message: `حداقل ${issue.minimum} عضو لازم است` };
      }
      return { message: `باید حداقل ${issue.minimum} باشد` };
    }
    case 'too_big': {
      if (issue.type === 'string') {
        return { message: `حداکثر ${issue.maximum} کاراکتر مجاز است` };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return issue.inclusive
          ? { message: `باید ${issue.maximum} یا کمتر باشد` }
          : { message: `باید کمتر از ${issue.maximum} باشد` };
      }
      if (issue.type === 'array' || issue.type === 'set') {
        return { message: `حداکثر ${issue.maximum} عضو مجاز است` };
      }
      return { message: `باید حداکثر ${issue.maximum} باشد` };
    }
    case 'invalid_string': {
      const messages: Partial<Record<string, string>> = {
        email: 'ایمیل معتبر نیست',
        url: 'آدرس اینترنتی معتبر نیست',
        uuid: 'شناسه معتبر نیست',
        cuid: 'شناسه معتبر نیست',
        regex: 'قالب مقدار نامعتبر است',
        datetime: 'تاریخ و ساعت معتبر نیست',
        ip: 'آدرس IP معتبر نیست',
      };
      // `validation` is a string for known checks, but an object for
      // startsWith/endsWith/includes — those fall back to the generic text.
      const validation = typeof issue.validation === 'string' ? issue.validation : undefined;
      return { message: (validation ? messages[validation] : undefined) ?? 'قالب مقدار نامعتبر است' };
    }
    case 'invalid_enum_value':
      return { message: `یکی از این مقادیر باید باشد: ${issue.options.join('، ')}` };
    case 'invalid_union':
      return { message: 'مقدار با هیچ‌یک از قالب‌های مجاز مطابقت ندارد' };
    case 'unrecognized_keys':
      return { message: `کلید ناشناس مجاز نیست: ${issue.keys.join('، ')}` };
    case 'invalid_date':
      return { message: 'تاریخ نامعتبر است' };
    case 'invalid_arguments':
    case 'invalid_return_type':
    case 'invalid_literal':
    case 'invalid_intersection_types':
      return { message: 'مقدار نامعتبر است' };
    case 'not_multiple_of':
      return { message: `باید مضربی از ${issue.multipleOf} باشد` };
    case 'not_finite':
      return { message: 'باید عدد متناهی باشد' };
    default:
      return { message: ctx.defaultError };
  }
};
