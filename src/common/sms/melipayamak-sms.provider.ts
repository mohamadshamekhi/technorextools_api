import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

const BASE_SERVICE_URL =
  'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';

export interface MelipayamakOptions {
  username: string;
  password: string;
  /** Numeric id of the approved OTP service pattern. */
  otpPatternId: string;
}

interface BaseServiceResponse {
  Value?: string;
  RetStatus?: number;
  StrRetStatus?: string;
}

/**
 * MelliPayamak (ملی‌پیامک) provider.
 *
 * OTP goes through the service-pattern endpoint (BaseServiceNumber): the approved
 * pattern carries the wording, we only pass the code as its variable. Pattern
 * variables are joined with `;` in `text` — the OTP pattern is expected to have a
 * single `{0}` slot, so we send just the code.
 *
 * Free-text `send()` is not supported on this endpoint; it falls back to logging
 * a warning so non-OTP callers fail loudly rather than silently.
 */
@Injectable()
export class MelipayamakSmsProvider extends SmsService {
  private readonly logger = new Logger('SMS');

  constructor(private readonly options: MelipayamakOptions) {
    super();
  }

  send(mobile: string, message: string): Promise<void> {
    this.logger.warn(
      `MelliPayamak provider only sends OTP via pattern; dropping free-text message to ${mobile}: ${message}`,
    );
    return Promise.resolve();
  }

  override async sendOtp(mobile: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      username: this.options.username,
      password: this.options.password,
      to: mobile,
      bodyId: this.options.otpPatternId,
      text: code,
    });

    let res: Response;
    try {
      res = await fetch(BASE_SERVICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new Error(
        `MelliPayamak request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!res.ok) {
      throw new Error(`MelliPayamak responded ${res.status}`);
    }

    const data = (await res.json()) as BaseServiceResponse;
    // RetStatus === 1 is success; anything else is an error code (see panel docs).
    if (data.RetStatus !== 1) {
      throw new Error(
        `MelliPayamak send rejected: RetStatus=${data.RetStatus ?? 'null'} (${data.StrRetStatus ?? 'unknown'})`,
      );
    }
  }
}
