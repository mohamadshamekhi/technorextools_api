import { Module } from '@nestjs/common';
import { StorefrontNotificationsController } from './storefront-notifications.controller';
import { StorefrontNotificationsService } from './storefront-notifications.service';

@Module({
  controllers: [StorefrontNotificationsController],
  providers: [StorefrontNotificationsService],
})
export class StorefrontNotificationsModule {}
