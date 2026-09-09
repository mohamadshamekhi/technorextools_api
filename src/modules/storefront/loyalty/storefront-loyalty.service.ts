import { Injectable, NotFoundException } from '@nestjs/common';
import type { LoyaltyType, ReferralReward } from '@prisma/client';
import { UserRepository } from '../../access/repositories/user.repository';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { ReferralRepository } from '../../referral/repositories/referral.repository';

export interface LoyaltySummaryView {
  balance: number;
  transactions: {
    items: Array<{ points: number; type: LoyaltyType; note: string | null; at: Date }>;
    total: number;
    skip: number;
    take: number;
  };
}

export interface ReferralsView {
  referralCode: string;
  grantedCount: number;
  invitees: Array<{ name: string | null; maskedMobile: string; rewardStatus: ReferralReward; at: Date }>;
}

@Injectable()
export class StorefrontLoyaltyService {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralRepository,
    private readonly users: UserRepository,
  ) {}

  async summary(userId: string, skip: number, take: number): Promise<LoyaltySummaryView> {
    const [balance, [rows, total]] = await Promise.all([
      this.loyalty.balance(userId),
      this.loyalty.history(userId, skip, take),
    ]);
    return {
      balance,
      transactions: {
        items: rows.map((t) => ({ points: t.points, type: t.type, note: t.note, at: t.createdAt })),
        total,
        skip,
        take,
      },
    };
  }

  async referralSummary(userId: string): Promise<ReferralsView> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const [rows, grantedCount] = await Promise.all([
      this.referrals.listByReferrer(userId),
      this.referrals.countGrantedByReferrer(userId),
    ]);
    return {
      referralCode: user.referralCode,
      grantedCount,
      invitees: rows.map((r) => ({
        name: r.referred.fullName,
        maskedMobile: maskMobile(r.referred.mobile),
        rewardStatus: r.rewardStatus,
        at: r.createdAt,
      })),
    };
  }
}

function maskMobile(mobile: string): string {
  return mobile.length >= 11 ? `${mobile.slice(0, 4)}***${mobile.slice(-3)}` : '***';
}
