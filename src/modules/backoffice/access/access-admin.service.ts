import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionRepository } from '../../access/repositories/permission.repository';
import { RoleRepository } from '../../access/repositories/role.repository';
import {
  PERMISSIONS,
  SUPERADMIN_ROLE_SLUG,
  type PermissionDef,
} from '../../access/permission.catalog';
import type { CreateRoleInput, UpdateRoleInput } from './access-admin.schemas';

export interface RoleView {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

@Injectable()
export class AccessAdminService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
  ) {}

  /** Grouped catalog for the panel's permission picker. */
  listPermissions(): Array<{ group: string; permissions: PermissionDef[] }> {
    const byGroup = new Map<string, PermissionDef[]>();
    for (const p of PERMISSIONS) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return [...byGroup.entries()].map(([group, permissions]) => ({ group, permissions }));
  }

  async listRoles(): Promise<RoleView[]> {
    const roles = await this.roles.findAllWithPermissions();
    return roles.map(toView);
  }

  async getRole(id: string): Promise<RoleView> {
    const role = await this.roles.findByIdWithPermissions(id);
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    return toView(role);
  }

  async createRole(input: CreateRoleInput): Promise<RoleView> {
    const clash = await this.roles.findBySlug(input.slug);
    if (clash) {
      throw new ConflictException('این اسلاگ قبلاً استفاده شده');
    }
    const role = await this.roles.create({
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
    });
    await this.applyPermissions(role.id, input.permissions);
    return this.getRole(role.id);
  }

  async updateRole(id: string, input: UpdateRoleInput): Promise<RoleView> {
    const role = await this.roles.findById(id);
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    if (role.slug === SUPERADMIN_ROLE_SLUG && input.permissions) {
      throw new ForbiddenException('مجوزهای سوپرادمین قابل تغییر نیست');
    }
    await this.roles.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    });
    if (input.permissions) {
      await this.applyPermissions(id, input.permissions);
    }
    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roles.findByIdWithPermissions(id);
    if (!role) {
      throw new NotFoundException('نقش یافت نشد');
    }
    if (role.isSystem) {
      throw new ForbiddenException('نقش سیستمی قابل حذف نیست');
    }
    if (role._count.users > 0) {
      throw new BadRequestException('ابتدا کاربران این نقش را جابه‌جا کنید');
    }
    await this.roles.delete(id);
  }

  private async applyPermissions(roleId: string, codes: string[]): Promise<void> {
    const perms = await this.permissions.findByCodes(codes);
    await this.roles.replacePermissions(
      roleId,
      perms.map((p) => p.id),
    );
  }
}

function toView(role: {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  _count: { users: number };
  permissions: Array<{ permission: { code: string } }>;
}): RoleView {
  return {
    id: role.id,
    title: role.title,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions:
      role.slug === SUPERADMIN_ROLE_SLUG
        ? PERMISSIONS.map((p) => p.code)
        : role.permissions.map((rp) => rp.permission.code),
  };
}
