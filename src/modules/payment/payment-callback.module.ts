import { Module } from '@nestjs/common';
import { PaymentCallbackController } from './payment-callback.controller';

/** Registers the gateway return route. Order/payment repos come from OrdersModule (@Global). */
@Module({
  controllers: [PaymentCallbackController],
})
export class PaymentCallbackModule {}
