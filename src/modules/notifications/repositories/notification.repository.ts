import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `notifications` collection. */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  /** Scoped to the owner — a no-op (count 0) if `id` isn't theirs. */
  async markRead(id: string, userId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return count;
  }

  create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
  }): Promise<Notification> {
    return this.prisma.notification.create({ data });
  }

  /** Same message fanned out to many users in one write. */
  async createForUsers(
    userIds: string[],
    data: { type: NotificationType; title: string; body: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...data })),
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
