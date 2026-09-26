import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeLoyaltyService } from './backoffice-loyalty.service';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const adjustSchema = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, 'مقدار امتیاز نباید صفر باشد'),
  note: z.string().trim().min(2).max(200),
});
type AdjustInput = z.infer<typeof adjustSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/loyalty`. */
@Controller('backoffice/loyalty')
export class BackofficeLoyaltyController {
  constructor(private readonly loyalty: BackofficeLoyaltyService) {}

  @RequirePermissions('loyalty.manage')
  @Get(':userId')
  summary(
    @Param('userId', new ZodValidationPipe(objectId)) userId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.loyalty.summary(userId, query.skip, query.take);
  }

  @RequirePermissions('loyalty.manage')
  @Post(':userId/adjust')
  adjust(
    @Param('userId', new ZodValidationPipe(objectId)) userId: string,
    @Body(new ZodValidationPipe(adjustSchema)) body: AdjustInput,
  ) {
    return this.loyalty.adjust(userId, body.points, body.note);
  }
}
