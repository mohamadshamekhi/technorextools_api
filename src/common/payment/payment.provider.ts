/**
 * Provider-agnostic payment port. `PaymentModule` binds one implementation by
 * `PAYMENT_PROVIDER`. Amounts are integer Toman.
 */
export interface CreatePaymentRequest {
  orderNumber: string;
  amount: number;
  /** Absolute URL the gateway redirects the browser back to after payment. */
  callbackUrl: string;
  mobile?: string;
  description: string;
}

export interface CreatePaymentResult {
  gateway: string;
  /** Opaque handle the gateway uses to identify this payment on the callback. */
  authority: string;
  /** Where to send the browser to complete payment. */
  redirectUrl: string;
}

export interface VerifyPaymentRequest {
  authority: string;
  amount: number;
  /** Raw callback query params, provider-specific (e.g. ZarinPal `Status`). */
  callbackParams: Record<string, string>;
}

export interface VerifyPaymentResult {
  success: boolean;
  /** Gateway transaction reference when successful. */
  refId?: string;
  /** Provider message for logging when unsuccessful. */
  message?: string;
}

export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResult>;
  abstract verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
}
