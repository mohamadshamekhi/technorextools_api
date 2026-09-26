import { Injectable } from '@nestjs/common';
import { ALL_PERMISSION_CODES, SUPERADMIN_ROLE_SLUG } from './permission.catalog';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';

export interface ResolvedActor {
  id: string;
  mobile: string;
  roleId: string;
  roleSlug: string;
  isSuperadmin: boolean;
  permissions: Set<string>;
}

@Injectable()
export class AccessService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  /** Load a user with role + effective permission codes. Used by `JwtStrategy`. */
  async resolveActor(userId: string): Promise<ResolvedActor | null> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive) {
      return null;
    }
    const role = await this.roles.findByIdWithPermissions(user.roleId);
    if (!role) {
      return null;
    }

    const isSuperadmin = role.slug === SUPERADMIN_ROLE_SLUG;
    const permissions = isSuperadmin
      ? new Set(ALL_PERMISSION_CODES)
      : new Set(role.permissions.map((rp) => rp.permission.code));

    return {
      id: user.id,
      mobile: user.mobile,
      roleId: user.roleId,
      roleSlug: role.slug,
      isSuperadmin,
      permissions,
    };
  }

  hasAll(actor: ResolvedActor, required: readonly string[]): boolean {
    if (actor.isSuperadmin) {
      return true;
    }
    return required.every((code) => actor.permissions.has(code));
  }
}
