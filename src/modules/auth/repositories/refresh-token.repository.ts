import { Injectable } from '@nestjs/common';
import type { Prisma, RefreshToken } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UserWithRole } from '../../access/repositories/user.repository';

/** All Prisma access for `refresh_tokens`. */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByHash(tokenHash: string): Promise<(RefreshToken & { user: UserWithRole }) | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });
  }

  create(data: Prisma.RefreshTokenUncheckedCreateInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  revoke(id: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
