import { Injectable } from '@nestjs/common';
import { ReferralReward, type Prisma, type Referral } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type ReferralWithReferred = Prisma.ReferralGetPayload<{
  include: { referred: { select: { fullName: true; mobile: true } } };
}>;

/** All Prisma access for the `referrals` collection. */
@Injectable()
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ReferralUncheckedCreateInput): Promise<Referral> {
    return this.prisma.referral.create({ data });
  }

  findByReferredUser(referredUserId: string): Promise<Referral | null> {
    return this.prisma.referral.findUnique({ where: { referredUserId } });
  }

  listByReferrer(referrerUserId: string): Promise<ReferralWithReferred[]> {
    return this.prisma.referral.findMany({
      where: { referrerUserId },
      orderBy: { createdAt: 'desc' },
      include: { referred: { select: { fullName: true, mobile: true } } },
    });
  }

  countGrantedByReferrer(referrerUserId: string): Promise<number> {
    return this.prisma.referral.count({
      where: { referrerUserId, rewardStatus: ReferralReward.granted },
    });
  }

  markGranted(id: string): Promise<Referral> {
    return this.prisma.referral.update({
      where: { id },
      data: { rewardStatus: ReferralReward.granted },
    });
  }
}
