import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { FakePaymentProvider } from './fake-payment.provider';
import { PaymentProvider } from './payment.provider';
import { ZarinpalPaymentProvider } from './zarinpal-payment.provider';

/**
 * Binds one `PaymentProvider` by `PAYMENT_PROVIDER` — `fake` (dev/CI, auto-succeeds)
 * or `zarinpal` (live v4 REST). Mirrors `SmsModule`.
 */
@Global()
@Module({
  providers: [
    {
      provide: PaymentProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PaymentProvider => {
        switch (config.get('PAYMENT_PROVIDER', { infer: true })) {
          case 'zarinpal':
            return new ZarinpalPaymentProvider({
              merchantId: config.get('ZARINPAL_MERCHANT_ID', { infer: true }),
              sandbox: config.get('ZARINPAL_SANDBOX', { infer: true }),
            });
          case 'fake':
          default:
            return new FakePaymentProvider();
        }
      },
    },
  ],
  exports: [PaymentProvider],
})
export class PaymentModule {}
