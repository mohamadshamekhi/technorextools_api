import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { BackofficeOrdersService } from './backoffice-orders.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(OrderStatus).optional(),
  q: z.string().trim().min(1).max(60).optional(), // order number
});
type ListQuery = z.infer<typeof listQuerySchema>;

const setStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional(),
  // Shipment info — meaningful when moving to `shipped`; shown by public order tracking.
  carrier: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
});
type SetStatusInput = z.infer<typeof setStatusSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/orders`. */
@Controller('backoffice/orders')
export class BackofficeOrdersController {
  constructor(private readonly orders: BackofficeOrdersService) {}

  @RequirePermissions('orders.view')
  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.orders.list(query);
  }

  @RequirePermissions('orders.view')
  @Get(':orderNumber')
  detail(@Param('orderNumber') orderNumber: string) {
    return this.orders.detail(orderNumber);
  }

  @RequirePermissions('orders.manage')
  @Patch(':orderNumber/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusInput,
  ) {
    return this.orders.setStatus(orderNumber, body.status, user.id, body.note, {
      carrier: body.carrier,
      trackingNumber: body.trackingNumber,
    });
  }

  /** Confirm cash-on-delivery/in-person payment for a `pending_payment` cash-method order. */
  @RequirePermissions('orders.manage')
  @Patch(':orderNumber/confirm-cash-payment')
  confirmCashPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orders.confirmCashPayment(orderNumber, user.id);
  }
}
