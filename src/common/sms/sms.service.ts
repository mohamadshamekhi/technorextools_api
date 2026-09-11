/**
 * Provider-agnostic SMS port. The blueprint leaves the concrete provider
 * (Kavenegar, MelliPayamak, …) undecided, so code depends only on this.
 */

/** Transactional notification templates. Providers map each to an approved pattern. */
export type SmsTemplate = 'order_paid' | 'order_status' | 'abandoned_cart';

export abstract class SmsService {
  abstract send(mobile: string, message: string): Promise<void>;

  /** OTP is common enough to have its own method; providers may use a template. */
  sendOtp(mobile: string, code: string): Promise<void> {
    return this.send(mobile, `کد ورود شما: ${code}`);
  }

  /**
   * Send a transactional notification. `vars` are the ordered pattern variables.
   * The default builds a plain message and calls `send()`; pattern-based
   * providers (MelliPayamak) override this to use the matching `bodyId`.
   */
  sendTemplate(mobile: string, template: SmsTemplate, vars: string[]): Promise<void> {
    return this.send(mobile, renderFallback(template, vars));
  }
}

/** Human-readable text used by console/dev providers and as a last resort. */
export function renderFallback(template: SmsTemplate, vars: string[]): string {
  switch (template) {
    case 'order_paid':
      return `سفارش ${vars[0] ?? ''} با موفقیت پرداخت شد.`;
    case 'order_status':
      return `وضعیت سفارش ${vars[0] ?? ''}: ${vars[1] ?? ''}`;
    case 'abandoned_cart':
      return `شما ${vars[0] ?? ''} کالا در سبد خرید فروشگاه ابزار تکنورکس دارید که هنوز نهایی نشده است.`;
  }
}
