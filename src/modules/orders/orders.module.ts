import { Global, Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories/order.repository';
import { PaymentRepository } from './repositories/payment.repository';

/**
 * Orders domain core — the `orders` repository (owns `order_items` and
 * `order_status_history`), the `payments` repository, and the `OrdersService`
 * lifecycle orchestrator. Consumed by checkout, the payment callback, the
 * sweep job and the backoffice.
 */
@Global()
@Module({
  providers: [OrderRepository, PaymentRepository, OrdersService],
  exports: [OrderRepository, PaymentRepository, OrdersService],
})
export class OrdersModule {}
