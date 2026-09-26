import { Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type RoleWithPermissions = Role & {
  permissions: Array<{ permission: { code: string } }>;
  _count: { users: number };
};

/** All Prisma access for `roles` + its `role_permissions` join collection. */
@Injectable()
export class RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { slug } });
  }

  findById(id: string): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { id } });
  }

  findAllWithPermissions(): Promise<RoleWithPermissions[]> {
    return this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
  }

  findByIdWithPermissions(id: string): Promise<RoleWithPermissions | null> {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { users: true } },
      },
    });
  }

  create(data: Prisma.RoleCreateInput): Promise<Role> {
    return this.prisma.role.create({ data });
  }

  update(id: string, data: Prisma.RoleUpdateInput): Promise<Role> {
    return this.prisma.role.update({ where: { id }, data });
  }

  delete(id: string): Promise<Role> {
    return this.prisma.role.delete({ where: { id } });
  }

  /** Replaces the full permission set for a role in one go. */
  async replacePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    }
  }
}
