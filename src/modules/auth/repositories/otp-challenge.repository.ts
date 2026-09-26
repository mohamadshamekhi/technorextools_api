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

  /**
   * Unconsumed = `consumedAt` unset. On the Mongo connector `{ consumedAt: null }`
   * does not match documents where the field was never written, so match on `isSet`.
   */
  private static readonly UNCONSUMED = { consumedAt: { isSet: false } } as const;

  /** The most recent still-usable (unconsumed, unexpired) challenge, if any. */
  findActive(mobile: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { mobile, ...OtpChallengeRepository.UNCONSUMED, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The most recent unconsumed challenge regardless of expiry — used by verify. */
  findLatestUnconsumed(mobile: string): Promise<OtpChallenge | null> {
    return this.prisma.otpChallenge.findFirst({
      where: { mobile, ...OtpChallengeRepository.UNCONSUMED },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invalidateActive(mobile: string): Promise<void> {
    await this.prisma.otpChallenge.updateMany({
      where: { mobile, ...OtpChallengeRepository.UNCONSUMED },
      data: { consumedAt: new Date() },
    });
  }

  create(data: Prisma.OtpChallengeCreateInput): Promise<OtpChallenge> {
    return this.prisma.otpChallenge.create({ data });
  }

  /**
   * Drop a challenge whose SMS failed to send — a soft `consume` would still
   * count against `countSince`, burning the caller's hourly quota for a code
   * they never received.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.otpChallenge.delete({ where: { id } });
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

  /** Purge challenges that expired before `before` (sweep job). Returns the count removed. */
  async deleteExpiredBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.otpChallenge.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return count;
  }
}
