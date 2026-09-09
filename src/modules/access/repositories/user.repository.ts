import { Injectable } from '@nestjs/common';
import type { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type UserWithRole = User & { role: Role };

/**
 * All Prisma access for the `users` collection. Consumed by `AccessService`
 * (session resolution), `AuthService` (OTP login), and the backoffice users
 * module — none of them touch `PrismaService.user` directly.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByIdWithRole(id: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({ where: { id }, include: { role: true } });
  }

  findByMobile(mobile: string): Promise<UserWithRole | null> {
    return this.prisma.user.findUnique({ where: { mobile }, include: { role: true } });
  }

  findByReferralCode(referralCode: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { referralCode } });
  }

  create(data: Prisma.UserCreateInput): Promise<UserWithRole> {
    return this.prisma.user.create({ data, include: { role: true } });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<UserWithRole> {
    return this.prisma.user.update({ where: { id }, data, include: { role: true } });
  }

  touchLastLogin(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  async paginate(
    where: Prisma.UserWhereInput,
    skip: number,
    take: number,
  ): Promise<{ items: UserWithRole[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { role: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }
}
