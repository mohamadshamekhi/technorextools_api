import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  listVariantsQuerySchema,
  replacePriceTiersSchema,
  updateInventoryVariantSchema,
  type ListVariantsQuery,
  type ReplacePriceTiersInput,
  type UpdateInventoryVariantInput,
} from './inventory.schemas';
import { InventoryService, type InventoryVariantView } from './inventory.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/inventory`. */
@Controller('backoffice/inventory')
export class BackofficeInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions('inventory.manage')
  @Get('variants')
  list(
    @Query(new ZodValidationPipe(listVariantsQuerySchema)) query: ListVariantsQuery,
  ): Promise<{ items: InventoryVariantView[]; total: number; skip: number; take: number }> {
    return this.inventory.list(query);
  }

  @RequirePermissions('inventory.manage')
  @Patch('variants/:id')
  updateVariant(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInventoryVariantSchema)) body: UpdateInventoryVariantInput,
  ): Promise<InventoryVariantView> {
    return this.inventory.updateVariant(id, body);
  }

  @RequirePermissions('inventory.manage')
  @Put('variants/:id/price-tiers')
  replacePriceTiers(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replacePriceTiersSchema)) body: ReplacePriceTiersInput,
  ): Promise<InventoryVariantView> {
    return this.inventory.replacePriceTiers(id, body);
  }
}
