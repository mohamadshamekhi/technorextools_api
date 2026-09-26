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
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createDiscountSchema,
  listDiscountsQuerySchema,
  updateDiscountSchema,
  type CreateDiscountInput,
  type ListDiscountsQuery,
  type UpdateDiscountInput,
} from './backoffice-discounts.schemas';
import { BackofficeDiscountsService } from './backoffice-discounts.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/discounts`. */
@Controller('backoffice/discounts')
export class BackofficeDiscountsController {
  constructor(private readonly discounts: BackofficeDiscountsService) {}

  @RequirePermissions('discounts.view')
  @Get()
  list(@Query(new ZodValidationPipe(listDiscountsQuerySchema)) query: ListDiscountsQuery) {
    return this.discounts.list(query);
  }

  @RequirePermissions('discounts.view')
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.discounts.getById(id);
  }

  @RequirePermissions('discounts.view')
  @Get(':id/usages')
  usages(@Param('id') id: string) {
    return this.discounts.listUsages(id);
  }

  @RequirePermissions('discounts.manage')
  @Post()
  create(@Body(new ZodValidationPipe(createDiscountSchema)) body: CreateDiscountInput) {
    return this.discounts.create(body);
  }

  @RequirePermissions('discounts.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDiscountSchema)) body: UpdateDiscountInput,
  ) {
    return this.discounts.update(id, body);
  }

  @RequirePermissions('discounts.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.discounts.remove(id);
  }
}
