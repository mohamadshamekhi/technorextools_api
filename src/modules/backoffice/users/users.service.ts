import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { RoleRepository } from '../../access/repositories/role.repository';
import { UserRepository, type UserWithRole } from '../../access/repositories/user.repository';
import { normalizeMobile } from '../../auth/mobile.util';
import { generateReferralCode } from '../../auth/referral-code.util';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schemas';

export interface UserView {
  id: string;
  fullName: string | null;
  mobile: string;
  email: string | null;
  role: { id: string; slug: string; title: string };
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserView>> {
    const and: Prisma.UserWhereInput[] = [];
    if (query.search) {
      and.push({
        OR: [
          { mobile: { contains: query.search } },
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.roleId) {
      and.push({ roleId: query.roleId });
    }
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

    const { items, total } = await this.users.paginate(where, query.skip, query.take);
    return { items: items.map(toView), total, skip: query.skip, take: query.take };
  }

  async create(input: CreateUserInput): Promise<UserView> {
    const role = await this.roles.findById(input.roleId);
    if (!role) throw new BadRequestException('نقش انتخاب‌شده وجود ندارد');
    const mobile = normalizeMobile(input.mobile);
    if (await this.users.findByMobile(mobile)) {
      throw new BadRequestException('کاربری با این شماره موبایل وجود دارد');
    }
    const user = await this.users.create({
      mobile,
      fullName: input.fullName,
      email: input.email,
      isActive: input.isActive,
      referralCode: generateReferralCode(),
      role: { connect: { id: input.roleId } },
    });
    return toView(user);
  }

  async getById(id: string): Promise<UserView> {
    const user = await this.users.findByIdWithRole(id);
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد');
    }
    return toView(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserView> {
    await this.getById(id);
    if (input.roleId) {
      const role = await this.roles.findById(input.roleId);
      if (!role) {
        throw new BadRequestException('نقش انتخاب‌شده وجود ندارد');
      }
    }
    const { roleId, ...rest } = input;
    const user = await this.users.update(id, {
      ...rest,
      ...(roleId ? { role: { connect: { id: roleId } } } : {}),
    });
    return toView(user);
  }
}

function toView(user: UserWithRole): UserView {
  return {
    id: user.id,
    fullName: user.fullName,
    mobile: user.mobile,
    email: user.email,
    role: { id: user.role.id, slug: user.role.slug, title: user.role.title },
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
