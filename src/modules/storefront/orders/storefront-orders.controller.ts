import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  StorefrontOrdersService,
  type OrderDetailView,
  type OrderListItemView,
} from './storefront-orders.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

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

  @Get(':orderNumber')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ): Promise<OrderDetailView> {
    return this.orders.detail(user.id, orderNumber);
  }
}
