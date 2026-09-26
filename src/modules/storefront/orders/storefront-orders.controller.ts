import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { mobileSchema } from '../../auth/auth.schemas';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  StorefrontOrdersService,
  type OrderDetailView,
  type OrderListItemView,
  type OrderStatsView,
  type OrderTrackingView,
} from './storefront-orders.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const trackSchema = z.object({
  code: z.string().trim().min(3, 'شماره سفارش الزامی است').max(40),
  mobile: mobileSchema,
});
type TrackInput = z.infer<typeof trackSchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/orders`. Authenticated, owner-scoped. */
@Controller('storefront/orders')
export class StorefrontOrdersController {
  constructor(private readonly orders: StorefrontOrdersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<{ items: OrderListItemView[]; total: number; skip: number; take: number }> {
    return this.orders.list(user.id, query.skip, query.take);
  }

  /**
   * Public order tracking — `{ code, mobile }`, no session. Rate-limited because
   * it is an unauthenticated lookup; a wrong pair is a 404, never "wrong mobile".
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('track')
  @HttpCode(HttpStatus.OK)
  track(@Body(new ZodValidationPipe(trackSchema)) body: TrackInput): Promise<OrderTrackingView> {
    return this.orders.track(body.code, body.mobile);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser): Promise<OrderStatsView> {
    return this.orders.stats(user.id);
  }

  @Get(':orderNumber')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ): Promise<OrderDetailView> {
    return this.orders.detail(user.id, orderNumber);
  }
}
