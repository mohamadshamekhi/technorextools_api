import { Injectable } from '@nestjs/common';
import type { OtpChallenge, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for `otp_challenges`. */
@Injectable()
export class OtpChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  countSince(mobile: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({ where: { mobile, createdAt: { gte: since } } });
  }

  /** The most recent still-usable (unconsumed, unexpired) challenge, if any. */
  findActive(mobile: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { mobile, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The most recent unconsumed challenge regardless of expiry — used by verify. */
  findLatestUnconsumed(mobile: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { mobile, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invalidateActive(mobile: string): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { mobile, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  create(data: Prisma.OtpChallengeCreateInput): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.create({ data });
  }

  incrementAttempts(id: string): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  consume(id: string): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.update({ where: { id }, data: { consumedAt: new Date() } });
  }
}
