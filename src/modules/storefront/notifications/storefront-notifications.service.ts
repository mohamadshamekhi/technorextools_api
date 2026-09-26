import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationRepository } from '../../notifications/repositories/notification.repository';

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
}

@Injectable()
export class StorefrontNotificationsService {
  constructor(private readonly notifications: NotificationRepository) {}

  async list(userId: string): Promise<NotificationView[]> {
    const rows = await this.notifications.findByUser(userId);
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      createdAt: r.createdAt,
      read: r.read,
    }));
  }

  async markRead(userId: string, id: string): Promise<void> {
    const count = await this.notifications.markRead(id, userId);
    if (count === 0) throw new NotFoundException('اعلان یافت نشد');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.markAllRead(userId);
  }
}
