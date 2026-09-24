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
import { ShippingCostType } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeShippingService } from './backoffice-shipping.service';

const createSchema = z.object({
  title: z.string().trim().min(2).max(120),
  costType: z.nativeEnum(ShippingCostType).default(ShippingCostType.flat),
  cost: z.number().int().min(0),
  freeOverAmount: z.number().int().min(0).nullable().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
const updateSchema = createSchema.partial();
type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/shipping-methods`. */
@Controller('backoffice/shipping-methods')
export class BackofficeShippingController {
  constructor(private readonly shipping: BackofficeShippingService) {}

  @RequirePermissions('shipping.manage')
  @Get()
  list() {
    return this.shipping.list();
  }

  @RequirePermissions('shipping.manage')
  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.shipping.create(body);
  }

  @RequirePermissions('shipping.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput) {
    return this.shipping.update(id, body);
  }

  @RequirePermissions('shipping.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.shipping.remove(id);
  }
}
