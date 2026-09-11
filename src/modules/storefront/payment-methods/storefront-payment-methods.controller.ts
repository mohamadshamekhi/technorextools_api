import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import {
  StorefrontPaymentMethodsService,
  type StorefrontPaymentMethodView,
} from './storefront-payment-methods.service';

/** Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/payment-methods`. */
@Controller('storefront/payment-methods')
export class StorefrontPaymentMethodsController {
  constructor(private readonly paymentMethods: StorefrontPaymentMethodsService) {}

  @Public()
  @Get()
  listMethods(): Promise<StorefrontPaymentMethodView[]> {
    return this.paymentMethods.listMethods();
  }
}
