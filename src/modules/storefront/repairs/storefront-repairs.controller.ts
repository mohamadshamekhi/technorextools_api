import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { mediaIdsSchema } from '../../media/media.schemas';
import { StorefrontRepairsService } from './storefront-repairs.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const createSchema = z.object({
  issueDescription: z.string().trim().min(10).max(2000),
  warrantySerial: z.string().trim().min(1).max(120).optional(),
  mediaIds: mediaIdsSchema.default([]),
});
type CreateInput = z.infer<typeof createSchema>;

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject'], { required_error: 'تصمیم الزامی است' }),
  note: z.string().trim().max(500).nullable().optional(),
});
type DecisionInput = z.infer<typeof decisionSchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/repairs`. Authenticated, owner-scoped. */
@Controller('storefront/repairs')
export class StorefrontRepairsController {
  constructor(private readonly repairs: StorefrontRepairsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.repairs.list(user.id, query.skip, query.take);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.repairs.detail(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSchema)) body: CreateInput,
  ) {
    return this.repairs.create(user.id, body.issueDescription, body.warrantySerial, body.mediaIds);
  }

  /** Approve or reject the technician's quote while `awaiting_customer`. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/decision')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: DecisionInput,
  ) {
    return this.repairs.decide(user.id, id, body.decision, body.note);
  }
}
