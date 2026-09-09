import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  PaymentProvider,
  type CreatePaymentRequest,
  type CreatePaymentResult,
  type VerifyPaymentRequest,
  type VerifyPaymentResult,
} from './payment.provider';

/**
 * Dev/CI payment provider. `createPayment` returns a redirect straight back to
 * the callback URL with `Status=OK`; `verifyPayment` always succeeds. No network.
 */
@Injectable()
export class FakePaymentProvider extends PaymentProvider {
  readonly name = 'fake';
  private readonly logger = new Logger('Payment');

  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult> {
    const authority = `FAKE-${randomBytes(12).toString('hex')}`;
    this.logger.log(`fake payment for ${req.orderNumber} (${req.amount} T) → ${authority}`);
    const url = new URL(req.callbackUrl);
    url.searchParams.set('Authority', authority);
    url.searchParams.set('Status', 'OK');
    return Promise.resolve({ gateway: this.name, authority, redirectUrl: url.toString() });
  }

  verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    const ok = req.callbackParams.Status === 'OK' || req.callbackParams.status === 'OK';
    return Promise.resolve(
      ok
        ? { success: true, refId: `FAKEREF-${Date.now()}` }
        : { success: false, message: 'fake payment cancelled' },
    );
  }
}
