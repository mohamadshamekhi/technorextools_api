import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PermissionCode } from '../../modules/access/permission.catalog';
import type { AuthenticatedUser } from '../../modules/auth/token.types';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * Global authorization gate. Runs after `JwtAuthGuard`, so `request.user` carries
 * the resolved permission set. A route with no `@RequirePermissions` needs only a
 * valid session (any authenticated user).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionCode[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('احراز هویت لازم است');
    }
    if (user.isSuperadmin) {
      return true;
    }

    const missing = required.filter((code) => !user.permissions.includes(code));
    if (missing.length > 0) {
      throw new ForbiddenException(`مجوز لازم برای این عملیات را ندارید: ${missing.join(', ')}`);
    }
    return true;
  }
}
