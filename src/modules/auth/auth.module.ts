import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../../config/env.schema';
import { StorefrontCartModule } from '../storefront/cart/storefront-cart.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { OtpChallengeRepository } from './repositories/otp-challenge.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

@Module({
  imports: [
    StorefrontCartModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    RefreshTokenRepository,
    OtpChallengeRepository,
  ],
  exports: [AuthService],
})
export class AuthModule {}
