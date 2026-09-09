import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import type { AuthenticatedUser } from '../../modules/auth/token.types';

function ctx(user?: Partial<AuthenticatedUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const make = (required: string[] | undefined) => {
    const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  };

  it('allows a route with no @RequirePermissions', () => {
    expect(make(undefined).canActivate(ctx())).toBe(true);
  });

  it('lets a superadmin through any permission', () => {
    const guard = make(['roles.manage']);
    expect(guard.canActivate(ctx({ isSuperadmin: true, permissions: [] }))).toBe(true);
  });

  it('allows when the user holds every required permission', () => {
    const guard = make(['users.view', 'users.manage']);
    expect(
      guard.canActivate(ctx({ isSuperadmin: false, permissions: ['users.view', 'users.manage'] })),
    ).toBe(true);
  });

  it('forbids when a permission is missing', () => {
    const guard = make(['users.manage']);
    expect(() =>
      guard.canActivate(ctx({ isSuperadmin: false, permissions: ['users.view'] })),
    ).toThrow(ForbiddenException);
  });

  it('forbids an unauthenticated request', () => {
    expect(() => make(['users.view']).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
