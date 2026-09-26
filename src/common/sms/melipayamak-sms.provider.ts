import { Injectable, Logger } from '@nestjs/common';
import { renderFallback, SmsService, type SmsTemplate } from './sms.service';

// Legacy REST: username + password, form-encoded, variables joined by ';'.
const BASE_SERVICE_URL = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
// Newer console API: apikey in the path, JSON body with an args array.
const SHARED_SEND_URL = (apiKey: string) =>
  `https://console.melipayamak.com/api/send/shared/${apiKey}`;

export interface MelipayamakOptions {
  /** Preferred. When set, the console.melipayamak.com shared-line API is used. */
  apiKey?: string;
  username?: string;
  password?: string;
  /** Numeric id of the approved OTP service pattern. */
  otpPatternId: string;
  /** bodyId per transactional template; unset → that notification is logged, not sent. */
  templatePatternIds: Partial<Record<SmsTemplate, string>>;
}

interface BaseServiceResponse {
  Value?: string;
  RetStatus?: number;
  StrRetStatus?: string;
}

interface SharedSendResponse {
  recId?: number;
  status?: string;
}

/**
 * MelliPayamak (ملی‌پیامک) provider — sends only through approved service
 * patterns (منوی توسعه‌دهندگان → وبسرویس خدماتی). OTP and each transactional
 * notification map to a `bodyId`; the ordered variables fill the pattern slots.
 *
 * Auth: an `apiKey` (console API, JSON) is preferred; `username`+`password`
 * (legacy REST, form-encoded) is the fallback.
 *
 * Free-text `send()` is unsupported here and logs a warning.
 */
@Injectable()
export class MelipayamakSmsProvider extends SmsService {
  private readonly logger = new Logger('SMS');

  constructor(private readonly options: MelipayamakOptions) {
    super();
  }

  send(mobile: string, message: string): Promise<void> {
    this.logger.warn(
      `MelliPayamak provider only sends via approved patterns; dropping free-text message to ${mobile}: ${message}`,
    );
    return Promise.resolve();
  }

  override sendOtp(mobile: string, code: string): Promise<void> {
    return this.sendPattern(mobile, this.options.otpPatternId, [code]);
  }

  override sendTemplate(mobile: string, template: SmsTemplate, vars: string[]): Promise<void> {
    const bodyId = this.options.templatePatternIds[template];
    if (!bodyId) {
      this.logger.warn(
        `no MelliPayamak pattern configured for '${template}'; not sent: ${renderFallback(template, vars)}`,
      );
      return Promise.resolve();
    }
    return this.sendPattern(mobile, bodyId, vars);
  }

  private sendPattern(mobile: string, bodyId: string, vars: string[]): Promise<void> {
    return this.options.apiKey
      ? this.sendViaApiKey(mobile, bodyId, vars)
      : this.sendViaBaseService(mobile, bodyId, vars);
  }

  private async sendViaApiKey(mobile: string, bodyId: string, vars: string[]): Promise<void> {
    const res = await this.post(SHARED_SEND_URL(this.options.apiKey as string), {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bodyId: Number(bodyId), to: mobile, args: vars }),
    });
    const data = (await res.json()) as SharedSendResponse;
    if (!data.recId || data.recId <= 0) {
      throw new Error(
        `MelliPayamak send rejected: ${data.status ?? 'unknown'}${describe(data.status)}`,
      );
    }
  }

  private async sendViaBaseService(mobile: string, bodyId: string, vars: string[]): Promise<void> {
    const body = new URLSearchParams({
      username: this.options.username as string,
      password: this.options.password as string,
      to: mobile,
      bodyId,
      text: vars.join(';'),
    });
    const res = await this.post(BASE_SERVICE_URL, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as BaseServiceResponse;
    // RetStatus === 1 / StrRetStatus === "OK" is success; else the code is in `Value`.
    if (data.RetStatus !== 1) {
      throw new Error(
        `MelliPayamak send rejected: code=${data.Value ?? 'null'} status=${data.StrRetStatus ?? 'unknown'}${describe(data.Value)}`,
      );
    }
  }

  private async post(url: string, init: { headers: Record<string, string>; body: BodyInit }) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000), ...init });
    } catch (err) {
      throw new Error(
        `MelliPayamak request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      // The status alone says nothing — MelliPayamak puts the reason in the body
      // (bad bodyId, unapproved pattern, wrong arg count …).
      const body = await res.text().catch(() => '');
      throw new Error(
        `MelliPayamak responded ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
      );
    }
    return res;
  }
}

/** A few documented error codes / messages, appended to logs for readability. */
const MELIPAYAMAK_ERRORS: Record<string, string> = {
  '0': 'نام کاربری یا رمز عبور نادرست',
  '2': 'اعتبار کافی نیست',
  '-4': 'کد الگو تأیید نشده است',
  '-5': 'تعداد/ترتیب متغیرها با الگو همخوانی ندارد',
  '-10': 'ارسال لینک در متغیرها ممنوع است',
  '-110': 'حساب به ApiKey نیاز دارد — MELIPAYAMAK_API_KEY را ست کنید',
  '18': 'شماره موبایل نامعتبر',
  '19': 'سقف ارسال روزانه وب‌سرویس',
};
function describe(codeOrStatus?: string): string {
  const hit = codeOrStatus ? MELIPAYAMAK_ERRORS[codeOrStatus] : undefined;
  return hit ? ` (${hit})` : '';
}
