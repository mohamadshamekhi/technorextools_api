import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  StorefrontDiscountsService,
  type DiscountValidationView,
} from './storefront-discounts.service';

const validateSchema = z.object({ code: z.string().trim().min(1).max(60) });
type ValidateInput = z.infer<typeof validateSchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/discounts`. Authenticated (per-user usage check). */
@Controller('storefront/discounts')
export class StorefrontDiscountsController {
  constructor(private readonly discounts: StorefrontDiscountsService) {}

  @Post('validate')
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(validateSchema)) body: ValidateInput,
  ): Promise<DiscountValidationView> {
    return this.discounts.validate(user.id, body.code);
  }
}
