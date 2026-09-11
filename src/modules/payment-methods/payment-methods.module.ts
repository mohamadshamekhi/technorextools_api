import { Global, Module } from '@nestjs/common';
import { PaymentMethodRepository } from './repositories/payment-method.repository';

/**
 * Payment-method domain core — the `payment_methods` repository, shared by the
 * storefront (public list + checkout) and backoffice (CRUD). Not to be confused
 * with `PaymentModule` (`common/payment`), which binds the single `PaymentProvider`
 * gateway that every `kind: online` method settles through.
 */
@Global()
@Module({
  providers: [PaymentMethodRepository],
  exports: [PaymentMethodRepository],
})
export class PaymentMethodsModule {}
