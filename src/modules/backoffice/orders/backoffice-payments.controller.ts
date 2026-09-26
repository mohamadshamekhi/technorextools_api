import { Controller, Get, Query } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PaymentRepository } from '../../orders/repositories/payment.repository';

const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(PaymentStatus).optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/payments`. */
@Controller('backoffice/payments')
export class BackofficePaymentsController {
  constructor(private readonly payments: PaymentRepository) {}

  @RequirePermissions('payments.view')
  @Get()
  async list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    const [rows, total] = await this.payments.paginate(
      query.status ? { status: query.status } : {},
      query.skip,
      query.take,
    );
    return { items: rows, total, skip: query.skip, take: query.take };
  }
}
