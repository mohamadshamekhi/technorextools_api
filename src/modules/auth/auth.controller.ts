import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, type AuthResult, type UserView } from './auth.service';
import type { OtpRequestResult } from './otp.service';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  updateProfileSchema,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RefreshInput,
  type UpdateProfileInput,
} from './auth.schemas';
import type { AuthenticatedUser } from './token.types';

/** Shared auth surface — used by both the storefront and the admin panel. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequestInput,
  ): Promise<OtpRequestResult> {
    return this.auth.requestOtp(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerifyInput,
  ): Promise<AuthResult> {
    return this.auth.verifyOtp(body);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  /** Bearer-authenticated, no body. Revokes every refresh token for the user. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logout(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserView> {
    return this.auth.getProfile(user.id);
  }

  /** Self-service profile edit (name / email). */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<UserView> {
    return this.auth.updateProfile(user.id, body);
  }
}
