import { BadRequestException, Injectable } from '@nestjs/common';
import { LoyaltyType } from '@prisma/client';
import { AppSettingsService } from '../content/app-settings.service';
import { LoyaltyTransactionRepository } from './repositories/loyalty-transaction.repository';

/**
 * Loyalty points ledger. Points are whole numbers; balance = Σ of all
 * transaction points (earn positive, redeem negative). 1 point = 1 Toman when
 * redeemed at checkout.
 */
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly txns: LoyaltyTransactionRepository,
    private readonly settings: AppSettingsService,
  ) {}

  balance(userId: string): Promise<number> {
    return this.txns.balanceOf(userId);
  }

  history(userId: string, skip: number, take: number) {
    return this.txns.listByUser(userId, skip, take);
  }

  /** Points earned by an order of the given Toman total. */
  async earnAmountFor(total: number): Promise<number> {
    const rate = await this.settings.getNumber('loyalty_points_per_toman');
    return Math.floor(total * rate);
  }

  /** Ceiling on how many points may be redeemed against a given net amount. */
  async maxRedeemableFor(userId: string, netAmount: number): Promise<number> {
    const [balance, pct] = await Promise.all([
      this.txns.balanceOf(userId),
      this.settings.getNumber('loyalty_redeem_max_percent'),
    ]);
    return Math.max(0, Math.min(balance, Math.floor((netAmount * pct) / 100)));
  }

  /** Credit earn points for a paid order, idempotently. */
  async creditForOrder(userId: string, orderId: string, total: number): Promise<void> {
    if (await this.txns.existsForOrder(orderId, LoyaltyType.earn)) return;
    const points = await this.earnAmountFor(total);
    if (points <= 0) return;
    await this.txns.create({
      userId,
      points,
      type: LoyaltyType.earn,
      referenceOrderId: orderId,
      note: 'امتیاز خرید',
    });
  }

  /** Debit redeemed points at order creation. `points` is a positive number. */
  async redeemForOrder(userId: string, orderId: string, points: number): Promise<void> {
    if (points <= 0) return;
    const balance = await this.txns.balanceOf(userId);
    if (points > balance) throw new BadRequestException('امتیاز کافی ندارید');
    await this.txns.create({
      userId,
      points: -points,
      type: LoyaltyType.redeem,
      referenceOrderId: orderId,
      note: 'استفاده در سفارش',
    });
  }

  /** Return previously redeemed points when an order is cancelled/expired. */
  async refundRedemption(userId: string, orderId: string): Promise<void> {
    const redeem = await this.txns.existsForOrder(orderId, LoyaltyType.redeem);
    if (!redeem) return;
    const REFUND_NOTE = 'بازگشت امتیاز لغو سفارش';
    if (await this.txns.findForOrderWithNote(orderId, REFUND_NOTE)) return;
    await this.txns.create({
      userId,
      points: -redeem.points, // redeem.points is negative → this credits back
      type: LoyaltyType.earn,
      referenceOrderId: orderId,
      note: REFUND_NOTE,
    });
  }

  /** Manual adjustment by an admin. */
  async adjust(userId: string, points: number, note: string): Promise<void> {
    await this.txns.create({
      userId,
      points,
      type: points >= 0 ? LoyaltyType.earn : LoyaltyType.redeem,
      note,
    });
  }
}
