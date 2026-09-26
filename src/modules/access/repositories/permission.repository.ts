import { Injectable } from '@nestjs/common';
import type { Permission } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * All Prisma access for `permissions`. The catalog *definition* lives in
 * `permission.catalog.ts` (static, seeded from); this repository reads the
 * seeded DB rows, e.g. to resolve codes → ids when assigning a role.
 */
@Injectable()
export class PermissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Permission[]> {
    return this.prisma.permission.findMany();
  }

  findByCodes(codes: string[]): Promise<Permission[]> {
    return this.prisma.permission.findMany({ where: { code: { in: codes } } });
  }
}
