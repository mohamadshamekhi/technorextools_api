import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentProvider,
  type CreatePaymentRequest,
  type CreatePaymentResult,
  type VerifyPaymentRequest,
  type VerifyPaymentResult,
} from './payment.provider';

export interface ZarinpalOptions {
  merchantId: string;
  sandbox: boolean;
}

interface ZarinpalRequestResponse {
  data?: { code?: number; authority?: string; message?: string };
  errors?: unknown;
}
interface ZarinpalVerifyResponse {
  data?: { code?: number; ref_id?: number; message?: string };
  errors?: unknown;
}

/**
 * ZarinPal Payment Gateway (v4 REST). ZarinPal settles in **Rial**, so Toman
 * amounts are multiplied by 10 on the way out. Uses the global `fetch`.
 */
@Injectable()
export class ZarinpalPaymentProvider extends PaymentProvider {
  readonly name = 'zarinpal';
  private readonly logger = new Logger('Payment');
  private readonly apiBase: string;
  private readonly startPayBase: string;

  constructor(private readonly options: ZarinpalOptions) {
    super();
    const host = options.sandbox ? 'sandbox.zarinpal.com' : 'payment.zarinpal.com';
    this.apiBase = `https://${host}/pg/v4/payment`;
    this.startPayBase = `https://${host}/pg/StartPay`;
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const res = await fetch(`${this.apiBase}/request.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: this.options.merchantId,
        amount: req.amount * 10,
        callback_url: req.callbackUrl,
        description: req.description,
        metadata: req.mobile ? { mobile: req.mobile } : undefined,
      }),
    });
    const body = (await res.json()) as ZarinpalRequestResponse;
    if (body.data?.code !== 100 || !body.data.authority) {
      this.logger.error(`zarinpal request failed: ${JSON.stringify(body.errors ?? body.data)}`);
      throw new Error('اتصال به درگاه پرداخت ناموفق بود');
    }
    return {
      gateway: this.name,
      authority: body.data.authority,
      redirectUrl: `${this.startPayBase}/${body.data.authority}`,
    };
  }

  async verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    const status = req.callbackParams.Status ?? req.callbackParams.status;
    if (status !== 'OK') {
      return { success: false, message: `gateway status ${status ?? 'missing'}` };
    }
    const res = await fetch(`${this.apiBase}/verify.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        merchant_id: this.options.merchantId,
        amount: req.amount * 10,
        authority: req.authority,
      }),
    });
    const body = (await res.json()) as ZarinpalVerifyResponse;
    // 100 = verified now, 101 = already verified
    if (body.data?.code === 100 || body.data?.code === 101) {
      return { success: true, refId: String(body.data.ref_id ?? req.authority) };
    }
    return { success: false, message: body.data?.message ?? 'verification failed' };
  }
}
