import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from '../../common/sms/sms.service';
import type { Env } from '../../config/env.schema';
import { UserRepository } from '../access/repositories/user.repository';
import { OtpChallengeRepository } from '../auth/repositories/otp-challenge.repository';
import { RefreshTokenRepository } from '../auth/repositories/refresh-token.repository';
import { AbandonedCartLogRepository } from '../cart/repositories/abandoned-cart-log.repository';
import { CartRepository } from '../cart/repositories/cart.repository';
import { AppSettingsService } from '../content/app-settings.service';
import { OrdersService } from '../orders/orders.service';
import { OrderRepository } from '../orders/repositories/order.repository';

const TICK_MS = 60_000;
const BATCH = 50;

/**
 * In-process periodic sweep (no external scheduler). Runs every minute:
 *  1. expires `pending_payment` orders past the reservation window → releases
 *     stock reservations, refunds redeemed points, marks the order `abandoned`;
 *  2. logs abandoned carts (active, untouched past `abandoned_cart_hours`) and
 *     sends a one-off reminder SMS.
 *
 * Deferred: purging expired `otp_challenges` / `refresh_tokens`.
 */
@Injectable()
export class SweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Sweep');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly orders: OrderRepository,
    private readonly ordersService: OrdersService,
    private readonly carts: CartRepository,
    private readonly abandonedLogs: AbandonedCartLogRepository,
    private readonly users: UserRepository,
    private readonly otpChallenges: OtpChallengeRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly settings: AppSettingsService,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    this.logger.log('sweep scheduled (every 60s)');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.expireStalePendingOrders();
      await this.logAbandonedCarts();
      await this.purgeAuthArtifacts();
    } catch (err) {
      this.logger.error(`tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async expireStalePendingOrders(): Promise<void> {
    const windowMin = await this.settings.getNumber('stock_hold_minutes');
    const cutoff = new Date(Date.now() - windowMin * 60_000);
    const stale = await this.orders.findExpiredPending(cutoff);
    for (const order of stale) {
      await this.ordersService.expire(order);
    }
  }

  private lastAuthPurge = 0;

  /** Hourly: drop OTP challenges and refresh tokens dead for more than a day. */
  private async purgeAuthArtifacts(): Promise<void> {
    if (Date.now() - this.lastAuthPurge < 3_600_000) return;
    this.lastAuthPurge = Date.now();
    const cutoff = new Date(Date.now() - 86_400_000);
    const [otp, tokens] = await Promise.all([
      this.otpChallenges.deleteExpiredBefore(cutoff),
      this.refreshTokens.deleteDeadBefore(cutoff),
    ]);
    if (otp || tokens) this.logger.log(`purged ${otp} otp challenges, ${tokens} refresh tokens`);
  }

  private async logAbandonedCarts(): Promise<void> {
    const hours = await this.settings.getNumber('abandoned_cart_hours');
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    const carts = await this.carts.findStaleActive(cutoff, BATCH);
    for (const cart of carts) {
      if (await this.abandonedLogs.findByCart(cart.id)) continue;
      const log = await this.abandonedLogs.create(cart.id, 'sms');
      if (cart.userId) {
        const user = await this.users.findById(cart.userId);
        if (user?.mobile) {
          const itemCount = cart.items.reduce((n, i) => n + i.qty, 0);
          try {
            await this.sms.sendTemplate(user.mobile, 'abandoned_cart', [String(itemCount)]);
            await this.abandonedLogs.markNotified(log.id);
          } catch {
            /* best-effort */
          }
        }
      }
    }
  }
}
