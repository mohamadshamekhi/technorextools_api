import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentProvider } from '../../common/payment/payment.provider';
import type { Env } from '../../config/env.schema';
import { OrdersService } from '../orders/orders.service';
import { PaymentRepository } from '../orders/repositories/payment.repository';

/**
 * Payment gateway return URL. Sits at the API root (`/api/v1/payment/callback`)
 * because the gateway — not a consumer app — calls it, with no auth. This and
 * `auth` are the only non-consumer-scoped route groups. The browser is
 * redirected on to `PAYMENT_RESULT_REDIRECT_URL` with `?orderNumber=&status=`.
 */
@Controller('payment')
export class PaymentCallbackController {
  private readonly logger = new Logger('Payment');

  constructor(
    private readonly ordersService: OrdersService,
    private readonly payments: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get('callback')
  async callback(@Query() query: Record<string, string>, @Res() res: Response): Promise<void> {
    const redirectBase = this.config.get('PAYMENT_RESULT_REDIRECT_URL', { infer: true });
    const orderNumber = query.orderNumber ?? '';
    const authority = query.Authority ?? query.authority ?? '';

    let status: 'success' | 'failed' = 'failed';
    try {
      const order = await this.ordersService.requireByNumber(orderNumber);
      const pending = await this.payments.findLatestPendingForOrder(order.id);
      const verification = await this.provider.verifyPayment({
        authority: authority || (pending?.refId ?? ''),
        amount: order.total,
        callbackParams: query,
      });
      if (verification.success) {
        await this.ordersService.markPaid(order, verification.refId ?? authority);
        status = 'success';
      } else {
        await this.ordersService.markPaymentFailed(order, verification.message ?? 'unknown');
      }
    } catch (err) {
      this.logger.error(
        `callback for order ${orderNumber} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const url = new URL(redirectBase);
    url.searchParams.set('orderNumber', orderNumber);
    url.searchParams.set('status', status);
    res.redirect(302, url.toString());
  }
}
