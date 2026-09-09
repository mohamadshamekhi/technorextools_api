import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { StorefrontTicketsService } from './storefront-tickets.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(50).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const createSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(4000),
});
type CreateInput = z.infer<typeof createSchema>;

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachmentUrl: z.string().url().max(500).optional(),
});
type ReplyInput = z.infer<typeof replySchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/tickets`. Authenticated, owner-scoped. */
@Controller('storefront/tickets')
export class StorefrontTicketsController {
  constructor(private readonly tickets: StorefrontTicketsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.tickets.list(user.id, query.skip, query.take);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.detail(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSchema)) body: CreateInput,
  ) {
    return this.tickets.create(user.id, body.subject, body.body);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replySchema)) body: ReplyInput,
  ) {
    return this.tickets.reply(user.id, id, body.body, body.attachmentUrl);
  }
}
