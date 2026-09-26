import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductQuestionStatus } from '@prisma/client';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { BackofficeProductQuestionsService } from './backoffice-product-questions.service';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(ProductQuestionStatus).default(ProductQuestionStatus.pending),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const answerSchema = z.object({
  answer: z.string().trim().min(1, 'متن پاسخ الزامی است').max(2000),
});
type AnswerInput = z.infer<typeof answerSchema>;

const setStatusSchema = z.object({
  status: z.enum([ProductQuestionStatus.approved, ProductQuestionStatus.rejected]),
});
type SetStatusInput = z.infer<typeof setStatusSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/product-questions`. */
@Controller('backoffice/product-questions')
export class BackofficeProductQuestionsController {
  constructor(private readonly questions: BackofficeProductQuestionsService) {}

  @RequirePermissions('product-questions.moderate')
  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.questions.list(query);
  }

  /** Answer + publish in one call. */
  @RequirePermissions('product-questions.moderate')
  @Post(':id/answer')
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(answerSchema)) body: AnswerInput,
  ) {
    return this.questions.answer(id, body.answer, user.id);
  }

  @RequirePermissions('product-questions.moderate')
  @Patch(':id')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusInput,
  ) {
    return this.questions.setStatus(id, body.status);
  }
}
