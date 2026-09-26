import { SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '../../modules/access/permission.catalog';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

/**
 * Gate a route on one or more permission codes (ALL are required).
 * Enforced by the global `PermissionsGuard`. Superadmin bypasses.
 *
 *   @RequirePermissions('products.manage')
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
