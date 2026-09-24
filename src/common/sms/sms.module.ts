import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { ConsoleSmsProvider } from './console-sms.provider';
import { MelipayamakSmsProvider } from './melipayamak-sms.provider';
import { SmsService } from './sms.service';

@Global()
@Module({
  providers: [
    {
      provide: SmsService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SmsService => {
        switch (config.get('SMS_PROVIDER', { infer: true })) {
          case 'melipayamak':
            return new MelipayamakSmsProvider({
              apiKey: config.get('MELIPAYAMAK_API_KEY', { infer: true }),
              username: config.get('MELIPAYAMAK_USERNAME', { infer: true }),
              password: config.get('MELIPAYAMAK_PASSWORD', { infer: true }),
              otpPatternId: config.get('MELIPAYAMAK_OTP_PATTERN_ID', {
                infer: true,
              }),
              templatePatternIds: {
                order_paid: config.get('MELIPAYAMAK_ORDER_PAID_PATTERN_ID', { infer: true }),
                order_status: config.get('MELIPAYAMAK_ORDER_STATUS_PATTERN_ID', { infer: true }),
                abandoned_cart: config.get('MELIPAYAMAK_ABANDONED_CART_PATTERN_ID', {
                  infer: true,
                }),
              },
            });
          case 'console':
          default:
            return new ConsoleSmsProvider();
        }
      },
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
