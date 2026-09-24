import { Global, Module } from '@nestjs/common';
import { NotificationRepository } from './repositories/notification.repository';

/** Notifications domain core — the `notifications` repository. */
@Global()
@Module({
  providers: [NotificationRepository],
  exports: [NotificationRepository],
})
export class NotificationsModule {}
