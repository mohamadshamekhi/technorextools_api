import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  storefrontListSparePartsQuerySchema,
  type StorefrontListSparePartsQuery,
} from './storefront-spare-parts.schemas';
import {
  StorefrontSparePartsService,
  type StorefrontSparePartView,
} from './storefront-spare-parts.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/spare-parts`. */
@Controller('storefront/spare-parts')
export class StorefrontSparePartsController {
  constructor(private readonly spareParts: StorefrontSparePartsService) {}

  @Public()
  @Get()
  list(
    @Query(new ZodValidationPipe(storefrontListSparePartsQuerySchema))
    query: StorefrontListSparePartsQuery,
  ): Promise<{ items: StorefrontSparePartView[]; total: number; skip: number; take: number }> {
    return this.spareParts.list(query);
  }

  @Public()
  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<StorefrontSparePartView> {
    return this.spareParts.detail(slug);
  }
}
