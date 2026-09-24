import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  StorefrontNotificationsService,
  type NotificationView,
} from './storefront-notifications.service';

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/notifications`. Authenticated. */
@Controller('storefront/notifications')
export class StorefrontNotificationsController {
  constructor(private readonly notifications: StorefrontNotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationView[]> {
    return this.notifications.list(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }
}
