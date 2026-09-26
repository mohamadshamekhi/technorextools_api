import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import {
  StorefrontShippingService,
  type StorefrontShippingMethodView,
} from './storefront-shipping.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/shipping`. */
@Controller('storefront/shipping')
export class StorefrontShippingController {
  constructor(private readonly shipping: StorefrontShippingService) {}

  @Public()
  @Get('methods')
  listMethods(): Promise<StorefrontShippingMethodView[]> {
    return this.shipping.listMethods();
  }
}
