import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ContactMessageStatus } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeInboxService } from './backoffice-inbox.service';

const listMessagesQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ContactMessageStatus).optional(),
});
type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

const setMessageStatusSchema = z.object({ status: z.nativeEnum(ContactMessageStatus) });
type SetMessageStatusInput = z.infer<typeof setMessageStatusSchema>;

const listSubscribersQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
  isActive: z.coerce.boolean().optional(),
});
type ListSubscribersQuery = z.infer<typeof listSubscribersQuerySchema>;

/** Admin panel — consumed by `abzar/backoffice`. Paths: `/api/v1/backoffice/contact-messages`, `/newsletter`. */
@Controller('backoffice')
export class BackofficeInboxController {
  constructor(private readonly inbox: BackofficeInboxService) {}

  @RequirePermissions('contact.view')
  @Get('contact-messages')
  listMessages(@Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery) {
    return this.inbox.listMessages(query);
  }

  @RequirePermissions('contact.view')
  @Patch('contact-messages/:id')
  setMessageStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setMessageStatusSchema)) body: SetMessageStatusInput,
  ) {
    return this.inbox.setMessageStatus(id, body.status);
  }

  @RequirePermissions('newsletter.view')
  @Get('newsletter')
  listSubscribers(
    @Query(new ZodValidationPipe(listSubscribersQuerySchema)) query: ListSubscribersQuery,
  ) {
    return this.inbox.listSubscribers(query);
  }
}
