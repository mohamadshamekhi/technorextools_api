import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The global rate-limit guard with a Persian 429 message — the default
 * `ThrottlerException` text ("ThrottlerException: Too Many Requests") is
 * English and reaches users as-is. Everything else behaves like the stock
 * guard; only the thrown error is replaced.
 */
@Injectable()
export class PersianThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): Promise<void> {
    throw new HttpException(
      'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
