import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { StorefrontLoyaltyService, type LoyaltySummaryView } from './storefront-loyalty.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/loyalty`. Authenticated. */
@Controller('storefront/loyalty')
export class StorefrontLoyaltyController {
  constructor(private readonly loyalty: StorefrontLoyaltyService) {}

  @Get()
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<LoyaltySummaryView> {
    return this.loyalty.summary(user.id, query.skip, query.take);
  }

  @Get('referrals')
  referrals(@CurrentUser() user: AuthenticatedUser) {
    return this.loyalty.referralSummary(user.id);
  }
}
