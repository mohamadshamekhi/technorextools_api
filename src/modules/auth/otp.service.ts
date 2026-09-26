import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import type { Env } from '../../config/env.schema';
import { SmsService } from '../../common/sms/sms.service';
import { OtpChallengeRepository } from './repositories/otp-challenge.repository';

export interface OtpRequestResult {
  expiresIn: number;
  resendAfter: number;
  /** Only populated when OTP_DEV_ECHO is on (never in production). */
  devCode?: string;
}

/** Never log a full mobile number alongside a failure. */
function maskMobile(mobile: string): string {
  return mobile.length > 6 ? `${mobile.slice(0, 4)}***${mobile.slice(-2)}` : '***';
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');

  constructor(
    private readonly challenges: OtpChallengeRepository,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async request(mobile: string, referralCode?: string): Promise<OtpRequestResult> {
    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const resendAfter = this.config.get('OTP_RESEND_SECONDS', { infer: true });
    const maxPerHour = this.config.get('OTP_MAX_PER_HOUR', { infer: true });
    const now = Date.now();

    const sentLastHour = await this.challenges.countSince(mobile, new Date(now - 3_600_000));
    if (sentLastHour >= maxPerHour) {
      throw new HttpException(
        'تعداد درخواست کد بیش از حد مجاز است. بعداً تلاش کنید.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const active = await this.challenges.findActive(mobile);
    if (active && now - active.lastSentAt.getTime() < resendAfter * 1000) {
      const wait = Math.ceil((resendAfter * 1000 - (now - active.lastSentAt.getTime())) / 1000);
      throw new HttpException(
        `تا ${wait} ثانیه دیگر امکان ارسال مجدد نیست`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 100_000)).padStart(5, '0');
    // Invalidate any earlier live challenge for this mobile.
    await this.challenges.invalidateActive(mobile);
    const challenge = await this.challenges.create({
      mobile,
      codeHash: await argon2.hash(code),
      referralCode: referralCode ?? null,
      expiresAt: new Date(now + ttl * 1000),
      maxAttempts: this.config.get('OTP_MAX_ATTEMPTS', { infer: true }),
      lastSentAt: new Date(),
    });

    try {
      await this.sms.sendOtp(mobile, code);
    } catch (err) {
      // The challenge is written before the send so the code is never in flight
      // unpersisted; if the send fails it must go, or the caller sits through a
      // resend cooldown (and loses hourly quota) for a code they never got.
      await this.challenges.delete(challenge.id).catch(() => undefined);
      this.logger.error(
        `OTP send failed for ${maskMobile(mobile)}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('ارسال پیامک ناموفق بود. لطفاً دوباره تلاش کنید.');
    }

    return {
      expiresIn: ttl,
      resendAfter,
      ...(this.config.get('OTP_DEV_ECHO', { infer: true }) ? { devCode: code } : {}),
    };
  }

  /** Returns the challenge's carried referralCode on success; throws on any failure. */
  async verify(mobile: string, code: string): Promise<{ referralCode: string | null }> {
    const challenge = await this.challenges.findLatestUnconsumed(mobile);
    if (!challenge || challenge.expiresAt < new Date()) {
      throw new BadRequestException('کد منقضی شده یا وجود ندارد. دوباره درخواست کنید.');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      await this.challenges.consume(challenge.id);
      throw new HttpException(
        'تعداد تلاش بیش از حد مجاز. کد جدید بگیرید.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const ok = await argon2.verify(challenge.codeHash, code).catch(() => false);
    if (!ok) {
      await this.challenges.incrementAttempts(challenge.id);
      const left = challenge.maxAttempts - challenge.attempts - 1;
      throw new UnauthorizedException(
        left > 0 ? `کد نادرست است (${left} تلاش باقی مانده)` : 'کد نادرست است',
      );
    }

    await this.challenges.consume(challenge.id);
    return { referralCode: challenge.referralCode };
  }
}
