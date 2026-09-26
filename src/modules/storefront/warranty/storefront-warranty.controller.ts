import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  storefrontWarrantyVerifyQuerySchema,
  type StorefrontWarrantyVerifyQuery,
} from './storefront-warranty.schemas';
import {
  StorefrontWarrantyService,
  type StorefrontWarrantyView,
} from './storefront-warranty.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/warranty`. */
@Controller('storefront/warranty')
export class StorefrontWarrantyController {
  constructor(private readonly warranty: StorefrontWarrantyService) {}

  @Public()
  @Get('verify')
  verify(
    @Query(new ZodValidationPipe(storefrontWarrantyVerifyQuerySchema))
    query: StorefrontWarrantyVerifyQuery,
  ): Promise<StorefrontWarrantyView> {
    return this.warranty.verify(query.serial);
  }
}
