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
  Put,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { SparePartView } from '../../spare-parts/spare-part.view';
import {
  createSparePartSchema,
  listSparePartsQuerySchema,
  replaceProductSparePartsSchema,
  updateSparePartSchema,
  type CreateSparePartInput,
  type ListSparePartsQuery,
  type ReplaceProductSparePartsInput,
  type UpdateSparePartInput,
} from './backoffice-spare-parts.schemas';
import { BackofficeSparePartsService } from './backoffice-spare-parts.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/spare-parts`. */
@Controller('backoffice/spare-parts')
export class BackofficeSparePartsController {
  constructor(private readonly spareParts: BackofficeSparePartsService) {}

  @RequirePermissions('spare-parts.manage')
  @Get()
  list(@Query(new ZodValidationPipe(listSparePartsQuerySchema)) query: ListSparePartsQuery) {
    return this.spareParts.list(query);
  }

  @RequirePermissions('spare-parts.manage')
  @Get(':id')
  getById(@Param('id') id: string): Promise<SparePartView> {
    return this.spareParts.getById(id);
  }

  @RequirePermissions('spare-parts.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(createSparePartSchema)) body: CreateSparePartInput,
  ): Promise<SparePartView> {
    return this.spareParts.create(body);
  }

  @RequirePermissions('spare-parts.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSparePartSchema)) body: UpdateSparePartInput,
  ): Promise<SparePartView> {
    return this.spareParts.update(id, body);
  }

  @RequirePermissions('spare-parts.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.spareParts.remove(id);
  }
}

/** Product-side view of the same relation. Path: `/api/v1/backoffice/products/:productId/spare-parts`. */
@Controller('backoffice/products/:productId/spare-parts')
export class BackofficeProductSparePartsController {
  constructor(private readonly spareParts: BackofficeSparePartsService) {}

  @RequirePermissions('spare-parts.manage')
  @Get()
  list(@Param('productId') productId: string): Promise<SparePartView[]> {
    return this.spareParts.listForProduct(productId);
  }

  @RequirePermissions('spare-parts.manage')
  @Put()
  replace(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(replaceProductSparePartsSchema))
    body: ReplaceProductSparePartsInput,
  ): Promise<SparePartView[]> {
    return this.spareParts.replaceForProduct(productId, body.sparePartIds);
  }
}
