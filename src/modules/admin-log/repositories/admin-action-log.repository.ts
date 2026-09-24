import { Injectable } from '@nestjs/common';
import type { AdminActionLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `admin_action_logs` collection. */
@Injectable()
export class AdminActionLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    ip?: string | null;
  }): Promise<AdminActionLog> {
    return this.prisma.adminActionLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
        metadata: data.metadata,
        ip: data.ip ?? null,
      },
    });
  }

  paginate(
    where: Prisma.AdminActionLogWhereInput,
    skip: number,
    take: number,
  ): Promise<
    [Array<AdminActionLog & { user: { fullName: string | null; mobile: string } }>, number]
  > {
    return Promise.all([
      this.prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { fullName: true, mobile: true } } },
      }),
      this.prisma.adminActionLog.count({ where }),
    ]);
  }
}
