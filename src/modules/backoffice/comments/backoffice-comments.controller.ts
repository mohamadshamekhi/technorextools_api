import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CommentStatus } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeCommentsService } from './backoffice-comments.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(CommentStatus).default(CommentStatus.pending),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const setStatusSchema = z.object({
  status: z.enum([CommentStatus.approved, CommentStatus.rejected]),
});
type SetStatusInput = z.infer<typeof setStatusSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/comments`. */
@Controller('backoffice/comments')
export class BackofficeCommentsController {
  constructor(private readonly comments: BackofficeCommentsService) {}

  @RequirePermissions('comments.moderate')
  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.comments.list(query);
  }

  @RequirePermissions('comments.moderate')
  @Patch(':id')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusInput,
  ) {
    return this.comments.setStatus(id, body.status);
  }
}
