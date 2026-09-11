import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PaymentMethodKind } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficePaymentMethodsService } from './backoffice-payment-methods.service';

const createSchema = z.object({
  code: z.nativeEnum(PaymentMethodKind),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
const updateSchema = createSchema.omit({ code: true }).partial();
type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

/**
 * Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/payment-methods`.
 * `code` is `@unique` and only settable on create — checkout already knows how to handle
 * just `online`/`cash`, so create/delete only toggle whether that code currently has a row.
 */
@Controller('backoffice/payment-methods')
export class BackofficePaymentMethodsController {
  constructor(private readonly paymentMethods: BackofficePaymentMethodsService) {}

  @RequirePermissions('payment-methods.manage')
  @Get()
  list() {
    return this.paymentMethods.list();
  }

  @RequirePermissions('payment-methods.manage')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.paymentMethods.detail(id);
  }

  @RequirePermissions('payment-methods.manage')
  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.paymentMethods.create(body);
  }

  @RequirePermissions('payment-methods.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput,
  ) {
    return this.paymentMethods.update(id, body);
  }

  @RequirePermissions('payment-methods.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.paymentMethods.remove(id);
  }
}
