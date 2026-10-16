import { Injectable, Logger } from '@nestjs/common';
import { renderFallback, SmsService, type SmsTemplate } from './sms.service';

const BASE_SERVICE_URL = 'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
const SHARED_SHARED_URL = (apiKey: string) =>
  `https://console.melipayamak.com/api/send/shared/${apiKey}`;

export interface MelipayamakOptions {
  apiKey?: string;
  username?: string;
  password?: string;
  otpPatternId: string;
  templatePatternIds: Partial<Record<SmsTemplate, string>>;
}

interface BaseServiceResponse {
  Value?: string;
  RetStatus?: number;
  StrRetStatus?: string;
}

interface SharedSendResponse {
  recId?: number;
  status?: string | number;
  [key: string]: unknown;
}

@Injectable()
export class MelipayamakSmsProvider extends SmsService {
  private readonly logger = new Logger('SMS');

  constructor(private readonly options: MelipayamakOptions) {
    super();
    // لاگ بررسی اولیه برای اطمینان از خوانده شدن توکن
    if (this.options.apiKey) {
      const masked = this.options.apiKey.length > 8 
        ? `${this.options.apiKey.slice(0, 4)}...${this.options.apiKey.slice(-4)}` 
        : '***';
      this.logger.log(`[Melipayamak Init] API Key loaded successfully. Length: ${this.options.apiKey.length}, Masked: ${masked}`);
    } else {
      this.logger.warn(`[Melipayamak Init] API Key is EMPTY! Will fallback to BaseService.`);
    }
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
    this.logger.log(`[Melipayamak Dispatch] Using mode: ${this.options.apiKey ? 'API Key (Console)' : 'BaseService (Username/Password)'}`);
    return this.options.apiKey
      ? this.sendViaApiKey(mobile, bodyId, vars)
      : this.sendViaBaseService(mobile, bodyId, vars);
  }

  private async sendViaApiKey(mobile: string, bodyId: string, vars: string[]): Promise<void> {
    const payload = { bodyId: Number(bodyId), to: mobile, args: vars };
    const apiKey = this.options.apiKey as string;
    const url = SHARED_SHARED_URL(apiKey);
    
    this.logger.log(`Sending MelliPayamak pattern via API key. URL: ${url}, bodyId: ${bodyId}`);

    const res = await this.post(url, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const rawText = await res.text();
    this.logger.log(`MelliPayamak raw response: ${rawText}`);

    let data: SharedSendResponse;
    try {
      data = JSON.parse(rawText) as SharedSendResponse;
    } catch {
      throw new Error(`MelliPayamak invalid JSON response: ${rawText}`);
    }

    // Check status or recId based on console API specifications
    const isSuccess = data.recId && Number(data.recId) > 0;
    if (!isSuccess) {
      throw new Error(
        `MelliPayamak send rejected: status=${String(data.status ?? 'unknown')}${describe(String(data.status))}`,
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
      const body = await res.text().catch(() => '');
      throw new Error(
        `MelliPayamak responded ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`,
      );
    }
    return res;
  }
}

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