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
              username: config.get('MELIPAYAMAK_USERNAME', { infer: true }),
              password: config.get('MELIPAYAMAK_PASSWORD', { infer: true }),
              otpPatternId: config.get('MELIPAYAMAK_OTP_PATTERN_ID', {
                infer: true,
              }),
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
