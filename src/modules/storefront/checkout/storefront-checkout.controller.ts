import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  previewCheckoutSchema,
  startCheckoutSchema,
  type PreviewCheckoutInput,
  type StartCheckoutInput,
} from './storefront-checkout.schemas';
import {
  StorefrontCheckoutService,
  type CheckoutQuote,
  type CheckoutStartResult,
} from './storefront-checkout.service';

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/checkout`. Authenticated. */
@Controller('storefront/checkout')
export class StorefrontCheckoutController {
  constructor(private readonly checkout: StorefrontCheckoutService) {}

  /** Compute the price breakdown (discount, points, shipping) without placing an order. */
  @Post('quote')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(previewCheckoutSchema)) body: PreviewCheckoutInput,
  ): Promise<CheckoutQuote> {
    return this.checkout.quote(user.id, body);
  }

  /** Place the order, reserve stock and open a payment session. */
  @Post()
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(startCheckoutSchema)) body: StartCheckoutInput,
  ): Promise<CheckoutStartResult> {
    return this.checkout.start(user.id, user.mobile, body);
  }

  /** Re-open payment for an existing pending order (retry after a failed attempt). */
  @Post(':orderNumber/pay')
  payAgain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ): Promise<{ paymentUrl: string }> {
    return this.checkout.payAgain(user.id, orderNumber, user.mobile);
  }
}
