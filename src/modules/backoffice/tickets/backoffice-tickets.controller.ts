import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { mediaIdsSchema } from '../../media/media.schemas';
import { BackofficeTicketsService } from './backoffice-tickets.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(TicketStatus).optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  mediaIds: mediaIdsSchema.default([]),
});
type ReplyInput = z.infer<typeof replySchema>;

const setStatusSchema = z.object({ status: z.nativeEnum(TicketStatus) });
type SetStatusInput = z.infer<typeof setStatusSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/tickets`. */
@Controller('backoffice/tickets')
export class BackofficeTicketsController {
  constructor(private readonly tickets: BackofficeTicketsService) {}

  @RequirePermissions('tickets.handle')
  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.tickets.list(query);
  }

  @RequirePermissions('tickets.handle')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.tickets.detail(id);
  }

  @RequirePermissions('tickets.handle')
  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replySchema)) body: ReplyInput,
  ) {
    return this.tickets.reply(user.id, id, body.body, body.mediaIds);
  }

  @RequirePermissions('tickets.handle')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusInput,
  ) {
    return this.tickets.setStatus(id, body.status);
  }
}
